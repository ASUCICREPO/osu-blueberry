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
    `You are an AI assistant designed to help users retrieve accurate and relevant information from the knowledge base. Answer questions based on the available documents. If you are unsure or the confidence score is low, inform the user instead of making assumptions.
      - If the confidence score is above 90%, provide a direct answer and send the confidence score.
      - If the confidence score is below 90%, say: "I couldn't find a reliable answer in the knowledge base. Please refine your query or provide more details."
      - Always maintain a professional, concise, and clear response format.`

    const agent = new bedrock.Agent(this, 'Agent', {
      name: 'Agent-with-knowledge-base',
      description: 'This agent is responsible for processing non-quantitative queries using PDF files and knowledge base.',
      foundationModel: cris_nova,
      shouldPrepareAgent: true,
      knowledgeBases: [kb],
      existingRole: bedrockRoleAgent,
      instruction: prompt_for_agent,
    });

    const AgentAlias = new bedrock.AgentAlias(this, 'AgentAlias', {
      agent: agent,
      description: 'Production alias for the agent',
    })




    



  }
}
