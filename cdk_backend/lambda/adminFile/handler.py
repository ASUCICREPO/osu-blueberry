import json
import boto3
from base64 import b64decode, b64encode
from datetime import datetime
import urllib.parse
from botocore.exceptions import ClientError
import os 

s3 = boto3.client('s3')
bedrock_agent = boto3.client('bedrock-agent')

BUCKET_NAME = os.environ["BUCKET_NAME"]
KNOWLEDGE_BASE_ID = os.environ["KNOWLEDGE_BASE_ID"]
DATA_SOURCE_ID = os.environ["DATA_SOURCE_ID"]

def lambda_handler(event, context):
    try:
        # Support both REST and HTTP APIs
        if 'httpMethod' in event:
            http_method = event['httpMethod']
            path = event['path']
            # For REST API
            path_parameters = event.get('pathParameters', {}) or {}
        else:
            http_method = event['requestContext']['http']['method']
            path = event['rawPath']
            # For HTTP API
            path_parameters = event.get('pathParameters', {}) or {}
        
        # Handle CORS preflight
        if http_method == 'OPTIONS':
            return {
                'statusCode': 200,
                'headers': {
                    'Access-Control-Allow-Origin': '*',
                    'Access-Control-Allow-Headers': 'Content-Type,Authorization,X-Amz-Date,X-Api-Key,X-Amz-Security-Token',
                    'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS',
                    'Access-Control-Max-Age': '600'
                },
                'body': ''
            }
        
        # routes (no auth check)
        if path == '/files' and http_method == 'GET':
            return handle_list_files()
        elif path == '/files' and http_method == 'POST':
            result = handle_upload_file(event)
            # Sync knowledge base after upload
            sync_knowledge_base()
            return result
        elif path.startswith('/files/') and http_method == 'GET':
            return handle_download_file(event, path, path_parameters)
        elif path.startswith('/files/') and http_method == 'DELETE':
            result = handle_delete_file(event, path, path_parameters)
            # Sync knowledge base after deletion
            sync_knowledge_base()
            return result
        elif path == '/sync' and http_method == 'POST':
            # Dedicated endpoint to trigger manual sync
            sync_result = sync_knowledge_base()
            return respond(200, {'message': 'Knowledge base sync initiated', 'details': sync_result})
        else:
            return respond(404, {'error': 'Route not found'})

    except Exception as e:
        print(f"Error in lambda_handler: {str(e)}")
        return respond(500, {'error': str(e)})

def sync_knowledge_base():
    """Synchronize the knowledge base with S3 bucket content"""
    try:
        print(f"Starting knowledge base sync for ID: {KNOWLEDGE_BASE_ID} with data source ID: {DATA_SOURCE_ID}")
        
        response = bedrock_agent.start_ingestion_job(
            knowledgeBaseId=KNOWLEDGE_BASE_ID,
            dataSourceId=DATA_SOURCE_ID 
        )
        
        print(f"Knowledge base sync initiated. Job ID: {response.get('ingestionJobId')}")
        return {
            'status': 'success',
            'job_id': response.get('ingestionJobId')
        }
    except Exception as e:
        print(f"Error syncing knowledge base: {str(e)}")
        return {
            'status': 'error',
            'message': str(e)
        }

def handle_list_files():
    try:
        objects = s3.list_objects_v2(Bucket=BUCKET_NAME)
        files = [ {
            'key': obj['Key'],
            'size': obj['Size'],
            'last_modified': obj['LastModified'].isoformat(),
            'actions': {
                'download': {'method': 'GET', 'endpoint': f'/files/{urllib.parse.quote_plus(obj["Key"])}'},
                'delete': {'method': 'DELETE', 'endpoint': f'/files/{urllib.parse.quote_plus(obj["Key"])}'}
            }
        } for obj in objects.get('Contents', [])]

        return respond(200, {
            'files': files,
            'upload': {'method': 'POST', 'endpoint': '/files'},
            'sync': {'method': 'POST', 'endpoint': '/sync'}  # Added sync endpoint
        })
    except Exception as e:
        print(f"Error in handle_list_files: {str(e)}")
        return respond(500, {'error': str(e)})

def handle_upload_file(event):
    try:
        body = json.loads(event['body'])
        filename = body.get('filename') or f"doc_{datetime.now().strftime('%Y%m%d_%H%M%S')}"
        content_type = body.get('content_type', 'application/octet-stream')
        file_content = b64decode(body['content'])

        s3.put_object(
            Bucket=BUCKET_NAME,
            Key=filename,
            Body=file_content,
            ContentType=content_type
        )

        return respond(200, {
            'message': 'File uploaded successfully',
            'file': {
                'name': filename,
                'url': f'/files/{urllib.parse.quote_plus(filename)}'
            },
            'kb_sync': 'Knowledge base sync initiated'
        })
    except Exception as e:
        print(f"Error in handle_upload_file: {str(e)}")
        return respond(500, {'error': str(e)})

def handle_delete_file(event, path, path_parameters):
    try:
        # Try to get the key from path parameters first (for API Gateway REST API)
        key = None
        if path_parameters and 'key' in path_parameters:
            key = path_parameters['key']
        
        # Fall back to extracting from the path
        if not key:
            key = urllib.parse.unquote_plus(path.split('/files/')[-1])
        
        print(f"Deleting file with key: {key}")
        
        # Additional validation
        if not key:
            return respond(400, {'error': 'File key not provided'})

        s3.delete_object(Bucket=BUCKET_NAME, Key=key)
        return respond(200, {
            'message': 'File deleted successfully',
            'deleted_file': key,
            'kb_sync': 'Knowledge base sync initiated'
        })
    except ClientError as e:
        print(f"S3 error in handle_delete_file: {str(e)}")
        if e.response['Error']['Code'] == 'NoSuchKey':
            return respond(404, {'error': f'File "{key}" not found in S3'})
        else:
            return respond(500, {'error': str(e)})
    except Exception as e:
        print(f"Error in handle_delete_file: {str(e)}")
        return respond(500, {'error': str(e)})

def handle_download_file(event, path, path_parameters):
    try:
        # Try to get the key from path parameters first (for API Gateway REST API)
        key = None
        if path_parameters and 'key' in path_parameters:
            key = path_parameters['key']
        
        # Fall back to extracting from the path
        if not key:
            key = urllib.parse.unquote_plus(path.split('/files/')[-1])
        
        print(f"Downloading file with key: {key}")
        
        # Additional validation
        if not key:
            return respond(400, {'error': 'File key not provided'})
            
        file_obj = s3.get_object(Bucket=BUCKET_NAME, Key=key)
        return {
            'statusCode': 200,
            'headers': {
                'Content-Type': file_obj['ContentType'],
                'Content-Disposition': f'attachment; filename="{key}"',
                'Access-Control-Allow-Origin': '*'
            },
            'body': b64encode(file_obj['Body'].read()).decode('utf-8'),
            'isBase64Encoded': True
        }
    except ClientError as e:
        print(f"S3 error in handle_download_file: {str(e)}")
        if e.response['Error']['Code'] == 'NoSuchKey':
            return respond(404, {'error': f'File "{key}" not found in S3'})
        else:
            return respond(500, {'error': str(e)})
    except Exception as e:
        print(f"Error in handle_download_file: {str(e)}")
        return respond(500, {'error': str(e)})

def respond(status_code, body):
    return {
        'statusCode': status_code,
        'headers': {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Headers': 'Content-Type',
            'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS'
        },
        'body': json.dumps(body)
    }