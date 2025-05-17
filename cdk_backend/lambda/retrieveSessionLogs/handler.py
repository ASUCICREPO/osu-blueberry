import os
import json
from datetime import datetime, timedelta
import boto3
from boto3.dynamodb.conditions import Attr
from collections import defaultdict

# Environment
TABLE_NAME = os.environ['DYNAMODB_TABLE']

# AWS clients
ddb   = boto3.resource('dynamodb')
table = ddb.Table(TABLE_NAME)

def lambda_handler(event, context):
    # 1) Parse timeframe parameter
    params = event.get('queryStringParameters') or {}
    tf = params.get('timeframe', 'today').lower()
    
    now = datetime.utcnow()
    if tf == 'today':
        start = datetime(now.year, now.month, now.day)
        end   = now
    elif tf == 'weekly':
        start = now - timedelta(days=now.weekday())
        start = datetime(start.year, start.month, start.day)
        end   = now
    elif tf == 'monthly':
        start = datetime(now.year, now.month, 1)
        end   = now
    elif tf == 'yearly':
        start = datetime(now.year, 1, 1)
        end   = now
    else:
        return {
            'statusCode': 400,
            'headers': {'Content-Type': 'application/json'},
            'body': json.dumps({'error': f'Invalid timeframe "{tf}"'})
        }
    
    start_iso = start.isoformat()
    end_iso   = end.isoformat()
    
    # 3) Scan DynamoDB for items in this window
    filter_exp = Attr('original_ts').between(start_iso, end_iso)

    # Use ExpressionAttributeNames to escape "location"
    resp = table.scan(
        FilterExpression=filter_exp,
        ProjectionExpression="session_id, #loc, category",
        ExpressionAttributeNames={ "#loc": "location" }
    )

    items = resp.get('Items', [])
    while 'LastEvaluatedKey' in resp:
        resp = table.scan(
            FilterExpression=filter_exp,
            ProjectionExpression="session_id, #loc, category",
            ExpressionAttributeNames={ "#loc": "location" },
            ExclusiveStartKey=resp['LastEvaluatedKey']
        )
        items.extend(resp.get('Items', []))
    
    # 4) Aggregate
    sessions = set()
    loc_counts = defaultdict(int)
    cat_counts = defaultdict(int)
    
    for it in items:
        sid = it.get('session_id')
        if sid:
            sessions.add(sid)
        loc = it.get('location')  # now returned under the real "location" key
        if loc:
            loc_counts[loc] += 1
        cat = it.get('category')
        if cat:
            cat_counts[cat] += 1
    
    result = {
        'timeframe':   tf,
        'start_date':  start.strftime('%Y-%m-%d'),
        'end_date':    end.strftime('%Y-%m-%d'),
        'user_count':  len(sessions),
        'locations':   list(loc_counts.keys()),
        'categories':  dict(cat_counts)
    }
    
    return {
        'statusCode': 200,
        'headers': {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*'
        },
        'body': json.dumps(result)
    }
