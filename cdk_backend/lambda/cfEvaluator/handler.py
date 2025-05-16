import json
import boto3
import os
from datetime import datetime

# Initialize AWS clients
bedrock_agent = boto3.client('bedrock-agent-runtime')
api_gateway = boto3.client('apigatewaymanagementapi', endpoint_url=os.environ['WS_API_ENDPOINT'])

agent_id = os.environ["AGENT_ID"]
agent_alias_id = os.environ["AGENT_ALIAS_ID"] 

def send_ws_response(connection_id, response):
    if connection_id and connection_id.startswith("mock-"):
        print(f"[TEST] Skipping WebSocket send for mock ID: {connection_id}")
        return

    try:
        api_gateway.post_to_connection(
            ConnectionId=connection_id,
            Data=json.dumps(response)
        )
    except Exception as e:
        print(f"WebSocket error: {str(e)}")

def lambda_handler(event, context):
    connection_id = None

    try:
        query = event.get("querytext", "").strip()
        connection_id = event.get("connectionId")
        session_id = event.get("session_id", context.aws_request_id)
        location = event.get("location")  # Must come from frontend first time
        
        print(f"Received Query - Session: {session_id}, Location: {location}, Query: {query}")

        max_retries = 2
        full_response = ""

        for attempt in range(max_retries):
            try:
                response = bedrock_agent.invoke_agent(
                    agentId=agent_id,
                    agentAliasId=agent_alias_id,
                    sessionId=session_id,
                    inputText=query
                )

                full_response = "".join(
                    event['chunk']['bytes'].decode('utf-8')
                    for event in response['completion']
                    if 'chunk' in event
                )
                break
            except Exception as e:
                print(f"Attempt {attempt + 1} failed: {str(e)}")
                if attempt == max_retries - 1:
                    raise

        
        print(full_response)

        result = {
                'responsetext': full_response,
            }

        if connection_id:
            send_ws_response(connection_id, result)
        return {'statusCode': 200, 'body': json.dumps(result)}

    except Exception as e:
        print(f"Error: {str(e)}")
        error_msg = {'error': str(e)}
        if connection_id:
            send_ws_response(connection_id, error_msg)
        return {'statusCode': 500, 'body': json.dumps(error_msg)}