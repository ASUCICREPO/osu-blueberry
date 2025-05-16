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
import * as cognito from 'aws-cdk-lib/aws-cognito';
import * as ses from 'aws-cdk-lib/aws-ses';
import * as sesActions from 'aws-cdk-lib/aws-ses-actions';
import { AwsCustomResource, AwsCustomResourcePolicy, PhysicalResourceId } from 'aws-cdk-lib/custom-resources';
import * as apigateway from 'aws-cdk-lib/aws-apigateway';


export class BlueberryStackMain extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    const githubToken = this.node.tryGetContext('githubToken');
    const githubOwner = this.node.tryGetContext('githubOwner');
    const githubRepo = this.node.tryGetContext('githubRepo');
    const adminEmail = this.node.tryGetContext('adminEmail');
    const route53EmailDomain = this.node.tryGetContext('route53EmailDomain');

    if (!githubToken || !githubOwner || !githubRepo || !adminEmail || !route53EmailDomain) {
      throw new Error(
        'Please provide all required context values: ' +
        'githubToken, githubOwner, githubRepo, and AdminEmail.\n' +
        'Example: cdk deploy ' +
        '-c githubToken=your-github-token ' +
        '-c githubOwner=your-github-owner ' +
        '-c githubRepo=your-github-repo ' +
        '-c AdminEmail=alerts@yourdomain.com'+
        '-c route53EmailDomain=yourdomain.com'
      );
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
      removalPolicy: cdk.RemovalPolicy.RETAIN, 
    });

    const emailBucket = new s3.Bucket(this, 'emailBucket', {
      enforceSSL: true,
      removalPolicy: cdk.RemovalPolicy.RETAIN, 
    });

    

    // Create a bucket to store multimodal data extracted from input files
    const supplementalBucket = new cdk.aws_s3.Bucket(this, "SSucket", {
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      enforceSSL: true,
      autoDeleteObjects: true,
    });

    // Create an S3 supplemental data storage location. The multimodal data storage bucket cannot 
    // be the same as the data source bucket if using an S3 data source
    const supplementalS3Storage = bedrock.SupplementalDataStorageLocation.s3({
      // NO trailing path—just the bucket
      uri: `s3://${supplementalBucket.bucketName}`
    });
    
    const cris_sonnet_3_5_v2 = bedrock.CrossRegionInferenceProfile.fromConfig({
      geoRegion: bedrock.CrossRegionInferenceProfileRegion.US,
      model: bedrock.BedrockFoundationModel.ANTHROPIC_CLAUDE_3_5_SONNET_V2_0,
    });

    

    const kb = new bedrock.VectorKnowledgeBase(this, 'BlueberryKnowledgeBase', {
      name: 'Blueberry-KnowledgeBase',
      description: 'Knowledge base for Blueberry cultivation and health benefits',
      embeddingsModel: bedrock.BedrockFoundationModel.TITAN_EMBED_TEXT_V2_1024,
      instruction: "Use this knowledge base to provide accurate information about blueberries, their cultivation, health benefits, and related agricultural practices.",
      supplementalDataStorageLocations: [supplementalS3Storage],
      
    });

    supplementalBucket.grantReadWrite(kb.role);

    const blueberryDataSource = new bedrock.S3DataSource(this, 'DataSource', {
        bucket: BlueberryData,
        knowledgeBase: kb,
        dataSourceName: 'PDFSource',
        parsingStrategy: bedrock.ParsingStrategy.foundationModel({
          parsingModel: bedrock.BedrockFoundationModel.ANTHROPIC_CLAUDE_HAIKU_V1_0,
        }),
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
      foundationModel: cris_sonnet_3_5_v2,
      shouldPrepareAgent: true,
      userInputEnabled:true,
      knowledgeBases: [kb],
      existingRole: bedrockRoleAgent,
      instruction: prompt_for_agent,
      guardrail:guardrail
    });

    const AgentAlias = new bedrock.AgentAlias(this, 'AgentAlias', {
      agent: agent,
      description: 'Production alias for the agent',
    })

    const senderIdentity = new ses.EmailIdentity(this, 'SenderIdentity', {
      identity: ses.Identity.email(adminEmail),
    });




    

    const notificationFn = new lambda.Function(this, 'NotifyAdminFn', {
      runtime: lambda.Runtime.PYTHON_3_12,
      handler: 'handler.lambda_handler',
      code: lambda.Code.fromDockerBuild('lambda/email'), 
      architecture: lambdaArchitecture,
      environment: {
        VERIFIED_SOURCE_EMAIL: adminEmail,
        ADMIN_EMAIL: adminEmail,
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


    notificationFn.addToRolePolicy(new iam.PolicyStatement({
      actions: [
        'ses:SendEmail',
        'ses:SendRawEmail',
      ],
      resources: [ senderIdentity.emailIdentityArn ],  // restricts to this verified address
    }));

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



    


    const emailHandler = new lambda.Function(this, 'blueberry-emailReply', {
      runtime: lambda.Runtime.PYTHON_3_12,
      code: lambda.Code.fromAsset('lambda/emailReply'),
      handler: 'handler.lambda_handler',
      memorySize: 2048,
      timeout: cdk.Duration.minutes(2),
      environment: {
        SOURCE_BUCKET_NAME: emailBucket.bucketName,
        DESTINATION_BUCKET_NAME: BlueberryData.bucketName,
        KNOWLEDGE_BASE_ID: kb.knowledgeBaseId,
        DATA_SOURCE_ID: blueberryDataSource.dataSourceId,
        ADMIN_EMAIL: adminEmail,
      },
    })

    // Create SES Receipt Rule Set
    const sesRuleSet = new ses.ReceiptRuleSet(this, 'blueberry-email-receipt-rule-set', {
      receiptRuleSetName: 'blueberry-email-processing-rule-set',
    });

    const blueberryEmail = `blueberrybot@${route53EmailDomain}`;

    const sesRule = sesRuleSet.addRule('blueberry-process-incoming-email', {
      recipients: [blueberryEmail],
      scanEnabled: true,
      tlsPolicy: ses.TlsPolicy.OPTIONAL,
    });

    // Add actions to the rule
    sesRule.addAction(new sesActions.S3({
      bucket: emailBucket,
      objectKeyPrefix: 'incoming/',
    }));

    sesRule.addAction(new sesActions.Lambda({
      function: emailHandler,
    }));

    const activate = new AwsCustomResource(this, 'ActivateReceiptRuleSet', {
      onCreate: {
        service: 'SES',
        action: 'setActiveReceiptRuleSet',
        parameters: {
          RuleSetName: sesRuleSet.receiptRuleSetName,  // matches your rule set’s name
        },
        // ensure this runs on every deploy if the name changes:
        physicalResourceId: PhysicalResourceId.of(sesRuleSet.receiptRuleSetName),
      },
      // give it permission to call SES
      policy: AwsCustomResourcePolicy.fromSdkCalls({
        resources: AwsCustomResourcePolicy.ANY_RESOURCE,
      }),
    });

    

    emailHandler.addPermission('AllowSESInvoke', {
      principal: new iam.ServicePrincipal('ses.amazonaws.com'),
      action: 'lambda:InvokeFunction',
      sourceAccount: this.account,
    });
    
    BlueberryData.grantReadWrite(emailHandler)
    emailBucket.grantRead(emailHandler)

    const bedrockPolicy = new iam.PolicyStatement({
      actions: ['bedrock:*'],
      resources: ['*'],
    });

    emailHandler.addToRolePolicy(bedrockPolicy);

    
    const userPool = new cognito.UserPool(this, 'Blueberry-User-Pool', {
      userPoolName: 'Blueberry-User-Pool',
      selfSignUpEnabled: false,
      signInAliases: { email: true },
      autoVerify: { email: true },
      passwordPolicy: {
        minLength: 8,
        requireLowercase: false,
        requireDigits: false,
        requireSymbols: false,
        requireUppercase: false,
      },
      standardAttributes: {
        email: { required: true, mutable: true },
        givenName: { required: true, mutable: true },
        familyName: { required: true, mutable: true },
      },
      accountRecovery: cognito.AccountRecovery.EMAIL_ONLY,
    });


    const userPoolClient = userPool.addClient('Blueberry-User-Pool-Client', {
      userPoolClientName: 'Blueberry-User-Pool-Client',
      authFlows: {
        userSrp: true,
        userPassword: true,
        adminUserPassword: true
      },
      oAuth: {
        flows: {
          authorizationCodeGrant: true,
          implicitCodeGrant: true
        },
        scopes: [
          cognito.OAuthScope.OPENID,
          cognito.OAuthScope.EMAIL,
          cognito.OAuthScope.PHONE,
          cognito.OAuthScope.PROFILE
        ],
        // callbackUrls: [`${appUrl}/callback`,"http://localhost:3000/callback"],
        // logoutUrls: [`${appUrl}/home`, "http://localhost:3000/home"],
        callbackUrls: ["http://localhost:3000/admin-dashboard"],
        logoutUrls: ["http://localhost:3000/"],
      },
      generateSecret: false,
      preventUserExistenceErrors: true,
      supportedIdentityProviders: [
        cognito.UserPoolClientIdentityProvider.COGNITO,
      ]
    });


    const identityPool = new cognito.CfnIdentityPool(this, 'Blueberry-IdentityPool', {
      allowUnauthenticatedIdentities: false,
      cognitoIdentityProviders: [
        {
          clientId: userPoolClient.userPoolClientId,
          providerName: userPool.userPoolProviderName,
        },
      ],
    });

    const authenticatedRole = new iam.Role(this, 'CognitoDefaultAuthenticatedRole', {
      assumedBy: new iam.FederatedPrincipal(
        'cognito-identity.amazonaws.com',
        {
          StringEquals: { 'cognito-identity.amazonaws.com:aud': identityPool.ref },
          'ForAnyValue:StringLike': { 'cognito-identity.amazonaws.com:amr': 'authenticated' },
        },
        'sts:AssumeRoleWithWebIdentity',
      ),
    });


    authenticatedRole.addToPolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: [
          's3:PutObject',
          's3:PutObjectAcl',
          's3:GetObject',
        ],
        resources: [
          BlueberryData.bucketArn + '/*',
        ],
      }),
    );

    new cognito.CfnIdentityPoolRoleAttachment(this, 'IdentityPoolRoleAttachment', {
      identityPoolId: identityPool.ref,
      roles: {
        authenticated: authenticatedRole.roleArn,
      },
    });


    const fileHandler = new lambda.Function(this, 'FileApiHandler', {
      runtime: lambda.Runtime.PYTHON_3_12,
      handler: 'handler.lambda_handler',
      code: lambda.Code.fromAsset('lambda/adminFile'),  
      memorySize: 1024,
      timeout: cdk.Duration.seconds(30),
      environment: {
        BUCKET_NAME:         BlueberryData.bucketName,  
        KNOWLEDGE_BASE_ID:   kb.knowledgeBaseId,
        DATA_SOURCE_ID:      blueberryDataSource.dataSourceId,
      }
    });

    BlueberryData.grantReadWrite(fileHandler);
    fileHandler.addToRolePolicy(new iam.PolicyStatement({
      actions: [ 'bedrock-agent:StartIngestionJob' ],
      resources: ['*'],    
    }));


    const AdminApi = new apigateway.RestApi(this, 'admin_api', {
      restApiName: 'AdminApi',
      description: 'API to fetch S3 files',
      defaultCorsPreflightOptions: {
        allowOrigins: apigateway.Cors.ALL_ORIGINS,
        allowMethods: apigateway.Cors.ALL_METHODS,
      },
    });

    const userPoolAuthorizer = new apigateway.CognitoUserPoolsAuthorizer(this, 'UserPoolAuthorizer', {
      cognitoUserPools: [userPool], 
    });

    const files = AdminApi.root.addResource('files');
    const single = files.addResource('{key}');
    const sync   = AdminApi.root.addResource('sync');

    const integ = new apigateway.LambdaIntegration(fileHandler, {
      proxy: true,
    });



    // Attach methods with Cognito auth
    [ 'GET', 'POST' ].forEach(method => {
      files.addMethod(method, integ, {
        authorizer: userPoolAuthorizer, 
        authorizationType: apigateway.AuthorizationType.COGNITO,
      });
    });

    [ 'GET', 'DELETE' ].forEach(method => {
      single.addMethod(method, integ, {
        authorizer: userPoolAuthorizer, 
        authorizationType: apigateway.AuthorizationType.COGNITO,
      });
    });

    sync.addMethod('POST', integ, {
      authorizer: userPoolAuthorizer, 
      authorizationType: apigateway.AuthorizationType.COGNITO,
    });












    // outputs





    



  }
}
