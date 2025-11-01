# Langfuse Trace Analyzer

A web-based tool for analyzing Langfuse traces with a beautiful, modern interface. Perfect for team collaboration and trace analysis.

## 🚀 Quick Deploy to AWS

### Prerequisites
- AWS CLI configured with your credentials
- Docker installed
- Node.js 18+ (for local development)

### One-Command Deployment

```bash
./deploy.sh
```

This script will:
1. ✅ Build and push a Docker image to ECR
2. ✅ Create an ECS Fargate cluster
3. ✅ Deploy the application with proper networking
4. ✅ Provide you with a public URL to share with your team

### Manual Steps (if needed)

1. **Install dependencies:**
   ```bash
   npm install
   ```

2. **Run locally:**
   ```bash
   npm start
   ```

3. **Access the application:**
   - Local: http://localhost:3000
   - AWS: The deploy script will provide the public URL

## 📊 Features

- **Drag & Drop Interface**: Easy file upload with visual feedback
- **Real-time Analysis**: Instant trace analysis and metrics
- **Beautiful Visualizations**: Modern, responsive UI
- **Team Collaboration**: Share analysis results with your team
- **Security**: Built with security best practices (Helmet, CORS, file validation)

## 🔧 Configuration

Copy `env.example` to `.env` and customize:

```bash
cp env.example .env
```

### Environment Variables

- `PORT`: Server port (default: 3000)
- `ALLOWED_ORIGINS`: Comma-separated list of allowed CORS origins
- `NODE_ENV`: Environment (development/production)

## 🛠 Development

```bash
# Install dependencies
npm install

# Run in development mode
npm run dev

# Build for production
npm run build
```

## 📁 Project Structure

```
├── server.js              # Express server
├── package.json           # Dependencies and scripts
├── Dockerfile            # Container configuration
├── deploy.sh             # AWS deployment script
├── public/
│   └── analyzer.html     # Frontend application
└── env.example           # Environment configuration template
```

## 🔒 Security Features

- **Helmet.js**: Security headers
- **CORS**: Configurable cross-origin requests
- **File Validation**: Only JSON files accepted
- **Size Limits**: 50MB file upload limit
- **Non-root Container**: Docker runs as non-root user

## 🌐 AWS Architecture

The deployment creates:
- **ECR Repository**: Stores Docker images
- **ECS Fargate Cluster**: Serverless container hosting
- **Security Groups**: Network access control
- **CloudWatch Logs**: Application logging
- **Public IP**: Accessible from anywhere

## 📈 Monitoring

View application logs:
```bash
aws logs tail /ecs/langfuse-trace-analyzer --follow --region us-east-1
```

## 🚀 Scaling

Scale your application:
```bash
# Scale up to 3 instances
aws ecs update-service --cluster trace-analyzer-cluster --service trace-analyzer-service --desired-count 3

# Scale down to 1 instance
aws ecs update-service --cluster trace-analyzer-cluster --service trace-analyzer-service --desired-count 1
```

## 🛑 Stopping the Service

```bash
aws ecs update-service --cluster trace-analyzer-cluster --service trace-analyzer-service --desired-count 0 --region us-east-1
```

## 💡 Tips

1. **Cost Optimization**: The default configuration uses minimal resources (256 CPU, 512 MB RAM)
2. **Custom Domain**: You can add a custom domain using AWS Route 53 and Application Load Balancer
3. **HTTPS**: Add SSL certificate for secure connections
4. **Backup**: ECR images are automatically backed up

## 🤝 Team Collaboration

Once deployed, share the public URL with your team. Everyone can:
- Upload their own trace files
- Analyze performance metrics
- View detailed trace information
- Collaborate on debugging sessions

## 📞 Support

If you encounter any issues:
1. Check the AWS CloudWatch logs
2. Verify your AWS credentials and permissions
3. Ensure Docker is running locally
4. Check the deployment script output for errors
