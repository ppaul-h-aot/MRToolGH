# 🔒 Security Guide for Langfuse Trace Analyzer

This guide explains how to secure your trace analyzer deployment to prevent unauthorized access.

## 🛡️ Security Options

### 1. **Basic Authentication** (Recommended for small teams)
- Username/password protection
- Simple to set up and manage
- Good for internal team access

### 2. **IP Whitelist** (Recommended for office networks)
- Restrict access to specific IP addresses or networks
- Supports CIDR notation (e.g., `192.168.1.0/24`)
- Perfect for office networks or VPN access

### 3. **Combined Security** (Most Secure)
- Both authentication AND IP whitelist
- Maximum protection for sensitive data

## 🚀 Quick Secure Deployment

### Option A: Interactive Secure Deployment
```bash
./deploy-secure.sh
```
This script will ask you for:
- Authentication credentials
- IP addresses to whitelist
- Security preferences

### Option B: Manual Configuration
1. Copy environment template:
   ```bash
   cp env.example .env
   ```

2. Edit `.env` with your security settings:
   ```bash
   # Enable authentication
   ENABLE_AUTH=true
   AUTH_USER=your_username
   AUTH_PASS=your_secure_password

   # Enable IP whitelist
   ENABLE_IP_WHITELIST=true
   ALLOWED_IPS=192.168.1.0/24,10.0.0.0/8,203.0.113.1
   ```

3. Deploy with security:
   ```bash
   ./deploy.sh
   ```

## 🔧 Security Configuration Examples

### Office Network Access
```bash
# Allow entire office network
ALLOWED_IPS=192.168.1.0/24,10.0.0.0/8

# With authentication
ENABLE_AUTH=true
AUTH_USER=team_admin
AUTH_PASS=secure_password_123
```

### VPN-Only Access
```bash
# Allow VPN network only
ALLOWED_IPS=10.8.0.0/24

# With authentication
ENABLE_AUTH=true
AUTH_USER=vpn_user
AUTH_PASS=strong_password_456
```

### Specific IP Addresses
```bash
# Allow specific office IPs
ALLOWED_IPS=203.0.113.1,203.0.113.2,203.0.113.3

# With authentication
ENABLE_AUTH=true
AUTH_USER=analyst
AUTH_PASS=complex_password_789
```

## 🌐 Finding Your Office IP Addresses

### Get Your Public IP:
```bash
curl ifconfig.me
```

### Get Your Office Network Range:
```bash
# On Windows
ipconfig

# On macOS/Linux
ifconfig
```

### Common Office Network Ranges:
- `192.168.1.0/24` - Home/office networks
- `10.0.0.0/8` - Corporate networks
- `172.16.0.0/12` - Private networks

## 🔍 Testing Security

### Test IP Whitelist:
```bash
# From allowed IP
curl http://your-server-ip:3000/health

# From blocked IP (should return 403)
curl http://your-server-ip:3000/health
```

### Test Authentication:
```bash
# Without credentials (should prompt for login)
curl http://your-server-ip:3000/

# With credentials
curl -u username:password http://your-server-ip:3000/
```

## 🚨 Security Best Practices

### 1. **Strong Passwords**
- Use at least 12 characters
- Include numbers, symbols, uppercase, lowercase
- Avoid dictionary words
- Example: `Tr4c3@n4lyz3r!2024`

### 2. **Regular Updates**
- Update passwords monthly
- Review IP whitelist quarterly
- Monitor access logs

### 3. **Network Security**
- Use HTTPS in production (add SSL certificate)
- Consider VPN-only access
- Monitor failed login attempts

### 4. **Data Protection**
- Don't upload sensitive production data
- Use test/sample data for analysis
- Consider data retention policies

## 🔧 Advanced Security Options

### 1. **Custom Domain with SSL**
```bash
# Add to your deployment
# 1. Get SSL certificate from AWS Certificate Manager
# 2. Set up Application Load Balancer
# 3. Configure custom domain
```

### 2. **AWS IAM Integration**
```bash
# Use AWS IAM for authentication
# 1. Create IAM users for team members
# 2. Use AWS Cognito for authentication
# 3. Integrate with company SSO
```

### 3. **VPN-Only Access**
```bash
# Deploy in private subnet
# 1. Remove public IP
# 2. Access only through VPN
# 3. Use bastion host for access
```

## 📊 Monitoring and Logging

### View Access Logs:
```bash
aws logs tail /ecs/langfuse-trace-analyzer --follow --region us-east-1
```

### Monitor Failed Access:
```bash
# Look for 403 errors in logs
aws logs filter-log-events \
  --log-group-name /ecs/langfuse-trace-analyzer \
  --filter-pattern "403" \
  --region us-east-1
```

## 🆘 Troubleshooting

### Common Issues:

1. **Can't access from office**
   - Check if your office IP is in whitelist
   - Verify CIDR notation is correct
   - Test with `curl ifconfig.me` to get your IP

2. **Authentication not working**
   - Check username/password in environment variables
   - Verify `ENABLE_AUTH=true` is set
   - Clear browser cache and try again

3. **Service not starting**
   - Check CloudWatch logs for errors
   - Verify all environment variables are set
   - Ensure security group allows port 3000

### Getting Help:
```bash
# Check service status
aws ecs describe-services --cluster trace-analyzer-cluster --services trace-analyzer-service

# View recent logs
aws logs tail /ecs/langfuse-trace-analyzer --since 1h
```

## 🔄 Updating Security Settings

### Change Password:
1. Update environment variables in ECS task definition
2. Redeploy service
3. Notify team of new credentials

### Add/Remove IPs:
1. Update `ALLOWED_IPS` environment variable
2. Redeploy service
3. Test access from new IPs

### Disable Security:
```bash
# Set in environment variables
ENABLE_AUTH=false
ENABLE_IP_WHITELIST=false
```

Remember: Security is a balance between protection and usability. Choose the level that fits your team's needs and data sensitivity.
