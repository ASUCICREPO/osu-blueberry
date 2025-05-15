import os
import boto3
from datetime import datetime

ses = boto3.client('ses')

def lambda_handler(event, context):
    """
    Expects:
      event = {
        "email": "user@example.com",
        "querytext": "What is blueberry pH?",
        "agentResponse": "Blueberries thrive at pH 4.5 to 5.5."
      }
    """
    try:
        email         = event['email']
        querytext     = event['querytext']
        agent_response = event['agentResponse']

        # Send notification email
        ses.send_email(
            Source=os.environ['VERIFIED_SOURCE_EMAIL'],
            Destination={'ToAddresses': [os.environ['ADMIN_EMAIL']]},
            Message={
                'Subject': {'Data': "Agent Assistance Requested"},
                'Body': {
                    'Text': {'Data': (
f"""Hello Admin,

A user needs assistance with this question:

  • User Email: {email}
  • Original Question: {querytext}
  • Agent’s Response: {agent_response}

Timestamp: {datetime.now().isoformat()}

Please assist as needed.

Thanks,
Blueberry BOT"""
                    )}
                }
            }
        )

        return {
            'status': 'success',
            'message': 'Admin notified'
        }

    except Exception as e:
        return {
            'status': 'error',
            'error': str(e),
            'request_id': context.aws_request_id
        }
