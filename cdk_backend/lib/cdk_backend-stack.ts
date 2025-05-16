import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as os from 'os';
import { aws_bedrock as bedrock2 } from 'aws-cdk-lib';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as apigatewayv2 from 'aws-cdk-lib/aws-apigatewayv2';
import * as apigatewayv2_integrations from 'aws-cdk-lib/aws-apigatewayv2-integrations';
import { bedrock as bedrock } from '@cdklabs/generative-ai-cdk-constructs';
import * as secretsmanager from 'aws-cdk-lib/aws-secretsmanager';
import * as amplify from '@aws-cdk/aws-amplify-alpha';
import * as path from 'path';

export class BlueberryStackMain extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    const githubToken = this.node.tryGetContext('githubToken');
    const githubOwner = this.node.tryGetContext('githubOwner');
    const githubRepo = this.node.tryGetContext('githubRepo');

    if (!githubToken || !githubOwner) {
      throw new Error('Please provide the githubToken, and githubOwner in the context. like this: cdk deploy -c githubToken=your-github-token -c githubOwner=your-github-owner -c githubRepo=your-github-repo');
    }

    const githubToken_secret_manager = new secretsmanager.Secret(this, 'GitHubToken2', {
      secretName: 'github-secret-token',
      description: 'GitHub Personal Access Token for Amplify',
      secretStringValue: cdk.SecretValue.unsafePlainText(githubToken)
    });

    const aws_region = cdk.Stack.of(this).region;
    const accountId = cdk.Stack.of(this).account;
    console.log(`AWS Region: ${aws_region}`);

    // detect Architecture
    const hostArchitecture = os.arch(); 
    console.log(`Host architecture: ${hostArchitecture}`);
    
    const lambdaArchitecture = hostArchitecture === 'arm64' ? lambda.Architecture.ARM_64 : lambda.Architecture.X86_64;
    console.log(`Lambda architecture: ${lambdaArchitecture}`);

    const BlueberryData = new s3.Bucket(this, 'BlueberryData', {
      enforceSSL: true,
      versioned: true,
      removalPolicy: cdk.RemovalPolicy.RETAIN, 
    });

    // Create a bucket to store multimodal data extracted from input files
    const supplementalBucket = new cdk.aws_s3.Bucket(this, "SSucket", {
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
    });

    // Create an S3 supplemental data storage location. The multimodal data storage bucket cannot 
    // be the same as the data source bucket if using an S3 data source
    const supplementalS3Storage = bedrock.SupplementalDataStorageLocation.s3({
      // NO trailing path—just the bucket
      uri: `s3://${supplementalBucket.bucketName}`
    });
    

    const kb = new bedrock.VectorKnowledgeBase(this, 'KnowledgeBase', {
      name: 'Blueberry-KB',
      description: 'Knowledge base for Blueberry cultivation and health benefits',
      embeddingsModel: bedrock.BedrockFoundationModel.TITAN_EMBED_TEXT_V2_1024,
      instruction: "Use this knowledge base to provide accurate information about blueberries, their cultivation, health benefits, and related agricultural practices.",
      supplementalDataStorageLocations: [supplementalS3Storage]
    });

    supplementalBucket.grantReadWrite(kb.role);

    const datasource = new bedrock.S3DataSource(this, 'DataSource', {
        bucket: BlueberryData,
        knowledgeBase: kb,
        dataSourceName: 'PDFs',
        parsingStrategy: bedrock.ParsingStrategy.foundationModel({
          parsingModel: bedrock.BedrockFoundationModel.ANTHROPIC_CLAUDE_3_5_HAIKU_V1_0,
        }),
      });

    

    const cris_nova = bedrock.CrossRegionInferenceProfile.fromConfig({
      geoRegion: bedrock.CrossRegionInferenceProfileRegion.US,
      model: bedrock.BedrockFoundationModel.AMAZON_NOVA_PRO_V1,
    });

    const bedrockRoleAgent = new iam.Role(this, 'BedrockRole3', {
      assumedBy: new iam.ServicePrincipal('bedrock.amazonaws.com'),
      managedPolicies: [
        // amazonq-ignore-next-line
        iam.ManagedPolicy.fromAwsManagedPolicyName('AmazonS3FullAccess'),
        iam.ManagedPolicy.fromAwsManagedPolicyName('AmazonBedrockFullAccess'),
        iam.ManagedPolicy.fromAwsManagedPolicyName('CloudWatchFullAccessV2'),
      ]});


      const guardrail = new bedrock.Guardrail(this, 'bedrockGuardrails-blueberry', {
        name: 'ChatbotGuardrails-blueberry',
        blockedOutputsMessaging: 'I am sorry, but I cannot provide that information. Plase ask me something else.',
      });
      
      const DEFAULT_INPUT  = bedrock.ContentFilterStrength.HIGH;
      const DEFAULT_OUTPUT = bedrock.ContentFilterStrength.MEDIUM;
      const INPUT_MODS  = [bedrock.ModalityType.TEXT, bedrock.ModalityType.IMAGE];
      const OUTPUT_MODS = [bedrock.ModalityType.TEXT];

      // Grab just the string‐enum members
      const allFilters = Object
        .values(bedrock.ContentFilterType)
        .filter((f): f is bedrock.ContentFilterType => typeof f === 'string');

      for (const type of allFilters) {
        const responseStrength =
          type === bedrock.ContentFilterType.PROMPT_ATTACK
            ? bedrock.ContentFilterStrength.NONE
            : DEFAULT_OUTPUT;

        guardrail.addContentFilter({
          type,
          inputStrength:  DEFAULT_INPUT,
          outputStrength: responseStrength,
          inputModalities:  INPUT_MODS,
          outputModalities: OUTPUT_MODS,
        });
      }


      const prompt_for_agent = 
      `You are a helpful AI assistant backed by a knowledge base.
      
      1. On every user question:
         • Query the KB and compute a confidence score (1-100).
         • If confidence ≥ 90:
             - Reply with the direct answer and include “(confidence: X%)”.
             - Do not ask for email or escalate.
         • If confidence < 90:
             - Say: “I'm sorry, I don't have a reliable answer right now.  
                      Could you please share your email so I can escalate this to an administrator for further help?”
             - Wait for the user to supply an email address.
      
      2. Once you receive a valid email address:
         • Call the action group function notify-admin with these parameters:
             - **email**: the user's email
             - **querytext**: the original question they asked
             - **agentResponse**: the best partial answer or summary you produced (even if low confidence)
         • After invoking, reply to the user:
             - “Thanks! An administrator has been notified and will follow up at [email]. Would you like to ask any other questions?”
      
      Always keep your tone professional, concise, and clear.`
      

    const agent = new bedrock.Agent(this, 'Agent', {
      name: 'Agent-with-knowledge-base',
      description: 'This agent is responsible for processing non-quantitative queries using PDF files and knowledge base.',
      foundationModel: cris_nova,
      shouldPrepareAgent: true,
      userInputEnabled:true,
      knowledgeBases: [kb],
      existingRole: bedrockRoleAgent,
      instruction: prompt_for_agent,
    });

    const AgentAlias = new bedrock.AgentAlias(this, 'AgentAlias', {
      agent: agent,
      description: 'Production alias for the agent',
    })

    

    const notificationFn = new lambda.Function(this, 'NotifyAdminFn', {
      runtime: lambda.Runtime.PYTHON_3_12,
      handler: 'handler.lambda_handler',
      code: lambda.Code.fromDockerBuild('lambda/email'), 
      architecture: lambdaArchitecture,
      environment: {
        VERIFIED_SOURCE_EMAIL: process.env.VERIFIED_SOURCE_EMAIL!,
        ADMIN_EMAIL: process.env.ADMIN_EMAIL!,
      },
      timeout: cdk.Duration.seconds(60),
    });
    
    // 2) Create the Action Group
    const notifyActionGroup = new bedrock.AgentActionGroup({
      name: 'notify-admin',
      description: 'Sends an admin email when the agent needs assistance.',
      executor: bedrock.ActionGroupExecutor.fromlambdaFunction(notificationFn),
      enabled: true,
      apiSchema: bedrock.ApiSchema.fromLocalAsset(path.join(__dirname, '../lambda/notify-admin-schema.yaml')),
    });
    
    // 3) Attach to your Bedrock Agent
    agent.addActionGroup(notifyActionGroup);

    const webSocketApi = new apigatewayv2.WebSocketApi(this, 'web-socket-api', {
      apiName: 'web-socket-api',
    });

    const webSocketStage = new apigatewayv2.WebSocketStage(this, 'web-socket-stage', {
      webSocketApi,
      stageName: 'production',
      autoDeploy: true,
    });


    const cfEvaluator = new lambda.Function(this, 'cfEvaluator', {
      runtime: lambda.Runtime.PYTHON_3_12,
      handler: 'handler.lambda_handler',
      code: lambda.Code.fromDockerBuild('lambda/cfEvaluator'), 
      architecture: lambdaArchitecture,
      environment: {
        WS_API_ENDPOINT: webSocketStage.callbackUrl,
        AGENT_ID: agent.agentId,
        AGENT_ALIAS_ID: AgentAlias.aliasId,
      },
      timeout: cdk.Duration.seconds(120),
    });

    BlueberryData.grantRead(cfEvaluator);

    cfEvaluator.role?.addManagedPolicy(
      cdk.aws_iam.ManagedPolicy.fromAwsManagedPolicyName('AmazonBedrockFullAccess'),
    );
    // api gateway 
    cfEvaluator.role?.addManagedPolicy(
      cdk.aws_iam.ManagedPolicy.fromAwsManagedPolicyName('AmazonAPIGatewayInvokeFullAccess'),
    );

    const webSocketHandler = new lambda.Function(this, 'web-socket-handler', {
      runtime: lambda.Runtime.PYTHON_3_12,
      code: lambda.Code.fromAsset('lambda/websocketHandler'),
      handler: 'handler.lambda_handler',
      timeout: cdk.Duration.seconds(120),
      environment: {
        RESPONSE_FUNCTION_ARN: cfEvaluator.functionArn
      }
    });

    cfEvaluator.grantInvoke(webSocketHandler)

    const webSocketIntegration = new apigatewayv2_integrations.WebSocketLambdaIntegration('web-socket-integration', webSocketHandler);

    webSocketApi.addRoute('sendMessage',
      {
        integration: webSocketIntegration,
        returnResponse: true
      }
    );




    



  }
}
