#!/bin/bash

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
APP_NAME="langfuse-trace-analyzer"
AWS_REGION="us-east-1"
ECR_REPOSITORY="langfuse-analyzer"
CLUSTER_NAME="trace-analyzer-cluster"
SERVICE_NAME="trace-analyzer-service"
TASK_DEFINITION="trace-analyzer-task"

echo -e "${BLUE}🔒 Deploying PRIVATE Langfuse Trace Analyzer to AWS${NC}"
echo "================================================"
echo -e "${YELLOW}This deployment will be accessible ONLY from your AWS VPC${NC}"
echo ""

# Check if AWS CLI is installed
if ! command -v aws &> /dev/null; then
    echo -e "${RED}❌ AWS CLI not found. Please install it first.${NC}"
    exit 1
fi

# Check if Docker is installed
if ! command -v docker &> /dev/null; then
    echo -e "${RED}❌ Docker not found. Please install it first.${NC}"
    exit 1
fi

# Check AWS credentials
echo -e "${YELLOW}🔐 Checking AWS credentials...${NC}"
if ! aws sts get-caller-identity &> /dev/null; then
    echo -e "${RED}❌ AWS credentials not configured. Please run 'aws configure'${NC}"
    exit 1
fi

ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
echo -e "${GREEN}✅ AWS Account: ${ACCOUNT_ID}${NC}"

# Get region from user or use default
read -p "Enter AWS region (default: $AWS_REGION): " USER_REGION
if [ ! -z "$USER_REGION" ]; then
    AWS_REGION=$USER_REGION
fi

echo -e "${BLUE}📍 Using region: $AWS_REGION${NC}"

# Security Configuration
echo -e "${YELLOW}🔒 Private Access Configuration${NC}"
echo "================================================"

# Get authentication settings
read -p "Enable basic authentication? (y/n, default: y): " ENABLE_AUTH_INPUT
ENABLE_AUTH=${ENABLE_AUTH_INPUT:-y}

if [[ $ENABLE_AUTH =~ ^[Yy]$ ]]; then
    read -p "Enter username (default: team_admin): " AUTH_USER
    AUTH_USER=${AUTH_USER:-team_admin}
    
    read -s -p "Enter password: " AUTH_PASS
    echo ""
    
    if [ -z "$AUTH_PASS" ]; then
        echo -e "${RED}❌ Password cannot be empty${NC}"
        exit 1
    fi
else
    AUTH_USER=""
    AUTH_PASS=""
fi

# Get VPC configuration
echo -e "${YELLOW}🌐 VPC Configuration${NC}"
echo "Available VPCs:"
aws ec2 describe-vpcs --region $AWS_REGION --query "Vpcs[*].[VpcId,Tags[?Key=='Name'].Value|[0],IsDefault]" --output table

read -p "Enter VPC ID (or press Enter for default VPC): " VPC_ID_INPUT
if [ -z "$VPC_ID_INPUT" ]; then
    VPC_ID=$(aws ec2 describe-vpcs --filters "Name=is-default,Values=true" --query "Vpcs[0].VpcId" --output text --region $AWS_REGION)
    echo -e "${BLUE}Using default VPC: $VPC_ID${NC}"
else
    VPC_ID=$VPC_ID_INPUT
fi

# Get private subnets
echo -e "${YELLOW}🔍 Finding private subnets in VPC $VPC_ID...${NC}"
PRIVATE_SUBNETS=$(aws ec2 describe-subnets \
  --filters "Name=vpc-id,Values=$VPC_ID" "Name=map-public-ip-on-launch,Values=false" \
  --query "Subnets[0:2].SubnetId" \
  --output text \
  --region $AWS_REGION)

if [ -z "$PRIVATE_SUBNETS" ] || [ "$PRIVATE_SUBNETS" = "None" ]; then
    echo -e "${YELLOW}⚠️  No private subnets found. Using public subnets with restricted access...${NC}"
    PRIVATE_SUBNETS=$(aws ec2 describe-subnets \
      --filters "Name=vpc-id,Values=$VPC_ID" \
      --query "Subnets[0:2].SubnetId" \
      --output text \
      --region $AWS_REGION)
fi

SUBNET_1=$(echo $PRIVATE_SUBNETS | cut -d' ' -f1)
SUBNET_2=$(echo $PRIVATE_SUBNETS | cut -d' ' -f2)

echo -e "${GREEN}✅ Using subnets: $SUBNET_1, $SUBNET_2${NC}"

# Create ECR repository if it doesn't exist
echo -e "${YELLOW}📦 Creating ECR repository...${NC}"
aws ecr describe-repositories --repository-names $ECR_REPOSITORY --region $AWS_REGION 2>/dev/null || \
aws ecr create-repository --repository-name $ECR_REPOSITORY --region $AWS_REGION

# Get ECR login token
echo -e "${YELLOW}🔑 Logging into ECR...${NC}"
aws ecr get-login-password --region $AWS_REGION | docker login --username AWS --password-stdin $ACCOUNT_ID.dkr.ecr.$AWS_REGION.amazonaws.com

# Build and push Docker image
echo -e "${YELLOW}🏗️  Building Docker image...${NC}"
docker build -t $APP_NAME .

# Tag and push to ECR
ECR_URI="$ACCOUNT_ID.dkr.ecr.$AWS_REGION.amazonaws.com/$ECR_REPOSITORY:latest"
echo -e "${YELLOW}📤 Pushing to ECR...${NC}"
docker tag $APP_NAME:latest $ECR_URI
docker push $ECR_URI

echo -e "${GREEN}✅ Image pushed to ECR: $ECR_URI${NC}"

# Create ECS cluster if it doesn't exist
echo -e "${YELLOW}🏗️  Creating ECS cluster...${NC}"
aws ecs describe-clusters --clusters $CLUSTER_NAME --region $AWS_REGION 2>/dev/null || \
aws ecs create-cluster --cluster-name $CLUSTER_NAME --region $AWS_REGION

# Create task definition with security environment variables
echo -e "${YELLOW}📋 Creating private task definition...${NC}"
cat > task-definition.json << EOF
{
  "family": "$TASK_DEFINITION",
  "networkMode": "awsvpc",
  "requiresCompatibilities": ["FARGATE"],
  "cpu": "256",
  "memory": "512",
  "executionRoleArn": "arn:aws:iam::$ACCOUNT_ID:role/ecsTaskExecutionRole",
  "containerDefinitions": [
    {
      "name": "$APP_NAME",
      "image": "$ECR_URI",
      "portMappings": [
        {
          "containerPort": 3000,
          "protocol": "tcp"
        }
      ],
      "essential": true,
      "logConfiguration": {
        "logDriver": "awslogs",
        "options": {
          "awslogs-group": "/ecs/$APP_NAME",
          "awslogs-region": "$AWS_REGION",
          "awslogs-stream-prefix": "ecs"
        }
      },
      "environment": [
        {
          "name": "NODE_ENV",
          "value": "production"
        },
        {
          "name": "PORT",
          "value": "3000"
        },
        {
          "name": "ENABLE_AUTH",
          "value": "$([[ $ENABLE_AUTH =~ ^[Yy]$ ]] && echo 'true' || echo 'false')"
        },
        {
          "name": "AUTH_USER",
          "value": "$AUTH_USER"
        },
        {
          "name": "AUTH_PASS",
          "value": "$AUTH_PASS"
        },
        {
          "name": "ENABLE_IP_WHITELIST",
          "value": "true"
        },
        {
          "name": "ALLOWED_IPS",
          "value": "10.0.0.0/8,172.16.0.0/12,192.168.0.0/16"
        }
      ]
    }
  ]
}
EOF

# Create CloudWatch log group
aws logs create-log-group --log-group-name "/ecs/$APP_NAME" --region $AWS_REGION 2>/dev/null || true

# Register task definition
aws ecs register-task-definition --cli-input-json file://task-definition.json --region $AWS_REGION

# Create security group with VPC-only access
echo -e "${YELLOW}🔒 Creating VPC-only security group...${NC}"
SECURITY_GROUP_ID=$(aws ec2 create-security-group \
  --group-name "$APP_NAME-private-sg" \
  --description "Private security group for $APP_NAME - VPC access only" \
  --vpc-id $VPC_ID \
  --region $AWS_REGION \
  --query 'GroupId' \
  --output text 2>/dev/null || \
aws ec2 describe-security-groups \
  --filters "Name=group-name,Values=$APP_NAME-private-sg" \
  --query "SecurityGroups[0].GroupId" \
  --output text \
  --region $AWS_REGION)

# Add VPC-only access rule
aws ec2 authorize-security-group-ingress \
  --group-id $SECURITY_GROUP_ID \
  --protocol tcp \
  --port 3000 \
  --cidr 10.0.0.0/8 \
  --region $AWS_REGION 2>/dev/null || true

aws ec2 authorize-security-group-ingress \
  --group-id $SECURITY_GROUP_ID \
  --protocol tcp \
  --port 3000 \
  --cidr 172.16.0.0/12 \
  --region $AWS_REGION 2>/dev/null || true

aws ec2 authorize-security-group-ingress \
  --group-id $SECURITY_GROUP_ID \
  --protocol tcp \
  --port 3000 \
  --cidr 192.168.0.0/16 \
  --region $AWS_REGION 2>/dev/null || true

# Create or update ECS service with NO public IP
echo -e "${YELLOW}🚀 Creating private ECS service...${NC}"
aws ecs describe-services --cluster $CLUSTER_NAME --services $SERVICE_NAME --region $AWS_REGION 2>/dev/null && \
aws ecs update-service \
  --cluster $CLUSTER_NAME \
  --service $SERVICE_NAME \
  --task-definition $TASK_DEFINITION \
  --region $AWS_REGION || \
aws ecs create-service \
  --cluster $CLUSTER_NAME \
  --service-name $SERVICE_NAME \
  --task-definition $TASK_DEFINITION \
  --desired-count 1 \
  --launch-type FARGATE \
  --network-configuration "awsvpcConfiguration={subnets=[$SUBNET_1,$SUBNET_2],securityGroups=[$SECURITY_GROUP_ID],assignPublicIp=DISABLED}" \
  --region $AWS_REGION

# Wait for service to be stable
echo -e "${YELLOW}⏳ Waiting for service to be stable...${NC}"
aws ecs wait services-stable --cluster $CLUSTER_NAME --services $SERVICE_NAME --region $AWS_REGION

# Get private IP
echo -e "${YELLOW}🌍 Getting private IP...${NC}"
TASK_ARN=$(aws ecs list-tasks --cluster $CLUSTER_NAME --service-name $SERVICE_NAME --region $AWS_REGION --query "taskArns[0]" --output text)
ENI_ID=$(aws ecs describe-tasks --cluster $CLUSTER_NAME --tasks $TASK_ARN --region $AWS_REGION --query "tasks[0].attachments[0].details[?name=='networkInterfaceId'].value" --output text)
PRIVATE_IP=$(aws ec2 describe-network-interfaces --network-interface-ids $ENI_ID --region $AWS_REGION --query "NetworkInterfaces[0].PrivateIpAddress" --output text)

# Clean up
rm -f task-definition.json

echo ""
echo -e "${GREEN}🎉 PRIVATE Deployment completed successfully!${NC}"
echo "================================================"
echo -e "${BLUE}📊 Your PRIVATE Langfuse Trace Analyzer is running at:${NC}"
echo -e "${GREEN}   http://$PRIVATE_IP:3000${NC}"
echo ""
echo -e "${YELLOW}🔒 Security Configuration:${NC}"
echo "  Access: VPC-ONLY (No public internet access)"
echo "  Authentication: $([[ $ENABLE_AUTH =~ ^[Yy]$ ]] && echo "Enabled (User: $AUTH_USER)" || echo "Disabled")"
echo "  IP Whitelist: Enabled (Private networks only)"
echo ""
echo -e "${YELLOW}🌐 Access Methods:${NC}"
echo "  1. AWS VPN Client (if you have VPN setup)"
echo "  2. AWS Systems Manager Session Manager"
echo "  3. Bastion host in the same VPC"
echo "  4. AWS Cloud9 environment in the same VPC"
echo ""
echo -e "${YELLOW}📋 Useful commands:${NC}"
echo "  View logs: aws logs tail /ecs/$APP_NAME --follow --region $AWS_REGION"
echo "  Stop service: aws ecs update-service --cluster $CLUSTER_NAME --service $SERVICE_NAME --desired-count 0 --region $AWS_REGION"
echo ""
echo -e "${BLUE}🔗 Access URL (VPC only): http://$PRIVATE_IP:3000${NC}"
echo -e "${YELLOW}⚠️  This URL is ONLY accessible from within your AWS VPC!${NC}"
