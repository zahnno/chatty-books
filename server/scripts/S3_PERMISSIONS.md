# S3 Permissions Required for Image Optimization Script

## Error: AccessDenied (403)

If you're getting an `AccessDenied` error, your AWS IAM user/role doesn't have the necessary permissions.

## Required IAM Permissions

The script needs the following S3 permissions on the `talkingbooks` bucket:

1. **s3:ListBucket** - To list all images in the bucket
2. **s3:GetObject** - To download images for optimization
3. **s3:PutObject** - To upload optimized images
4. **s3:DeleteObject** - To delete original images after optimization
5. **s3:CopyObject** - To create backups (if using `--backup` flag)

## IAM Policy Example

Here's a complete IAM policy you can attach to your IAM user or role:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "ImageOptimizationScriptPermissions",
      "Effect": "Allow",
      "Action": [
        "s3:ListBucket",
        "s3:GetObject",
        "s3:PutObject",
        "s3:DeleteObject",
        "s3:CopyObject"
      ],
      "Resource": [
        "arn:aws:s3:::talkingbooks",
        "arn:aws:s3:::talkingbooks/*"
      ]
    }
  ]
}
```

## How to Apply Permissions

### Option 1: Using AWS Console

1. Go to [IAM Console](https://console.aws.amazon.com/iam/)
2. Click on "Users" or "Roles" (depending on what you're using)
3. Select your user/role
4. Click "Add permissions" → "Create inline policy"
5. Click "JSON" tab
6. Paste the policy above
7. Click "Review policy"
8. Name it "S3ImageOptimization" and click "Create policy"

### Option 2: Using AWS CLI

```bash
# Create policy file
cat > s3-optimization-policy.json << EOF
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "ImageOptimizationScriptPermissions",
      "Effect": "Allow",
      "Action": [
        "s3:ListBucket",
        "s3:GetObject",
        "s3:PutObject",
        "s3:DeleteObject",
        "s3:CopyObject"
      ],
      "Resource": [
        "arn:aws:s3:::talkingbooks",
        "arn:aws:s3:::talkingbooks/*"
      ]
    }
  ]
}
EOF

# Create the policy
aws iam create-policy \
  --policy-name S3ImageOptimization \
  --policy-document file://s3-optimization-policy.json

# Attach to user (replace YOUR_USERNAME)
aws iam attach-user-policy \
  --user-name YOUR_USERNAME \
  --policy-arn arn:aws:iam::YOUR_ACCOUNT_ID:policy/S3ImageOptimization
```

## Verify Credentials

Make sure your `.env` file has the correct credentials:

```env
S3_ACCESS_KEY=your_access_key_id
S3_ACCESS_SECRET=your_secret_access_key
AWS_REGION=us-east-1
```

Or:

```env
AWS_ACCESS_KEY_ID=your_access_key_id
AWS_SECRET_ACCESS_KEY=your_secret_access_key
AWS_REGION=us-east-1
```

## Test Permissions

You can test if your credentials work by running:

```bash
# Test S3 access
aws s3 ls s3://talkingbooks/

# Or test with Node.js
node -e "
const AWS = require('aws-sdk');
AWS.config.update({
  accessKeyId: process.env.S3_ACCESS_KEY || process.env.AWS_ACCESS_KEY_ID,
  secretAccessKey: process.env.S3_ACCESS_SECRET || process.env.AWS_SECRET_ACCESS_KEY,
  region: 'us-east-1'
});
const s3 = new AWS.S3();
s3.listObjectsV2({ Bucket: 'talkingbooks', MaxKeys: 1 }, (err, data) => {
  if (err) console.error('Error:', err.message);
  else console.log('✅ S3 access working!');
});
"
```

## Security Best Practices

1. **Principle of Least Privilege**: Only grant the minimum permissions needed
2. **Use IAM Roles**: If running on EC2 or Lambda, use IAM roles instead of access keys
3. **Rotate Credentials**: Regularly rotate your access keys
4. **Monitor Access**: Enable CloudTrail to monitor S3 access
5. **Bucket Policy**: Consider adding a bucket policy for additional security

## Troubleshooting

### Still getting AccessDenied?

1. **Check bucket name**: Make sure the bucket name is exactly `talkingbooks`
2. **Check region**: Ensure your credentials are for the correct AWS region
3. **Check policy attachment**: Verify the policy is attached to the correct user/role
4. **Wait a few minutes**: IAM policy changes can take a few minutes to propagate
5. **Check bucket policy**: Make sure there's no bucket policy blocking your access

### Error: "The bucket you are attempting to access must be addressed using the specified endpoint"

This means your bucket is in a different region. Update your region:

```env
AWS_REGION=us-west-2  # or whatever region your bucket is in
```

### Error: "InvalidAccessKeyId"

Your access key ID is incorrect. Double-check your `.env` file.

### Error: "SignatureDoesNotMatch"

Your secret access key is incorrect. Double-check your `.env` file.
