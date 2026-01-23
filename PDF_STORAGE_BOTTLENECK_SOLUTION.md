# PDF Storage Performance Issue & Solution

## 🔴 **CRITICAL ISSUE IDENTIFIED**

Your PDFs are currently stored **in the PostgreSQL database** as base64-encoded strings. This is causing severe performance bottlenecks:

### Current Configuration
```env
NEXT_PUBLIC_UPLOAD_TRANSPORT="database"
```

### Why This Is Slow

1. **Database Bloat**
   - PDFs stored as base64 strings (33% larger than binary)
   - 5 MB PDF → ~6.6 MB database storage
   - Large BYTEA/TEXT columns slow down queries
   - Database backup/restore becomes massive

2. **Performance Impact**
   - Every PDF view requires full database query
   - No browser caching (must hit database each time)
   - No CDN support
   - High memory usage on database server
   - Slow first page load (must fetch entire PDF from DB first)

3. **Scalability Issues**
   - Database connections are limited
   - Concurrent users hit database directly
   - No edge caching or distribution
   - High network I/O between app server and database

### Performance Comparison

| Storage Type | 5MB PDF Load Time | Memory | Scalability | CDN Support |
|--------------|------------------|---------|-------------|-------------|
| **Database (Current)** | 3-10 seconds | High | Poor | ❌ No |
| **S3 + CDN** | 0.5-2 seconds | Low | Excellent | ✅ Yes |
| **Local Filesystem** | 1-3 seconds | Medium | Limited | ⚠️ Requires setup |

## ✅ **RECOMMENDED SOLUTION: Switch to S3-Compatible Storage**

### Option 1: AWS S3 (Production Recommended)

**Benefits:**
- ✅ 80-90% faster PDF loading
- ✅ CloudFront CDN support
- ✅ Automatic range requests (for progressive loading)
- ✅ Infinite scalability
- ✅ Built-in redundancy and backups
- ✅ Pay only for what you use

**Setup Steps:**

1. **Create AWS S3 Bucket**
```bash
# Use AWS CLI or Console
aws s3 mb s3://signdex-documents --region us-east-1
```

2. **Configure Bucket Policy (Private bucket, pre-signed URLs)**
```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Principal": {
        "AWS": "arn:aws:iam::YOUR-ACCOUNT:user/documenso-app"
      },
      "Action": [
        "s3:GetObject",
        "s3:PutObject",
        "s3:DeleteObject"
      ],
      "Resource": "arn:aws:s3:::signdex-documents/*"
    }
  ]
}
```

3. **Enable CORS for PDF Streaming**
```json
[
  {
    "AllowedOrigins": ["https://demo.signdex.ai"],
    "AllowedMethods": ["GET", "HEAD"],
    "AllowedHeaders": ["*"],
    "ExposeHeaders": [
      "Content-Length",
      "Content-Range",
      "Accept-Ranges",
      "ETag"
    ],
    "MaxAgeSeconds": 3600
  }
]
```

4. **Update .env Configuration**
```env
# Change from database to S3
NEXT_PUBLIC_UPLOAD_TRANSPORT="s3"

# AWS S3 Configuration
NEXT_PRIVATE_UPLOAD_REGION="us-east-1"
NEXT_PRIVATE_UPLOAD_BUCKET="signdex-documents"
NEXT_PRIVATE_UPLOAD_ACCESS_KEY_ID="AKIAXXXXXXXXXXXXXXXX"
NEXT_PRIVATE_UPLOAD_SECRET_ACCESS_KEY="your-secret-access-key"

# Remove these (only for MinIO/custom S3)
# NEXT_PRIVATE_UPLOAD_ENDPOINT=""
# NEXT_PRIVATE_UPLOAD_FORCE_PATH_STYLE="false"
```

5. **Set Up CloudFront CDN (Optional but Highly Recommended)**
   - Create CloudFront distribution pointing to S3 bucket
   - Enable compression
   - Set cache TTL to 1 year for completed documents
   - Configure behaviors for pre-signed URLs

### Option 2: Cloudflare R2 (Cost-Effective Alternative)

**Benefits:**
- ✅ S3-compatible API
- ✅ **Zero egress fees** (huge cost savings)
- ✅ Automatic Cloudflare CDN integration
- ✅ Similar performance to S3

**Setup:**

1. Create R2 Bucket in Cloudflare Dashboard

2. Generate API tokens with Read/Write permissions

3. **Update .env Configuration**
```env
NEXT_PUBLIC_UPLOAD_TRANSPORT="s3"

# Cloudflare R2 Configuration
NEXT_PRIVATE_UPLOAD_ENDPOINT="https://YOUR-ACCOUNT-ID.r2.cloudflarestorage.com"
NEXT_PRIVATE_UPLOAD_REGION="auto"
NEXT_PRIVATE_UPLOAD_BUCKET="signdex-documents"
NEXT_PRIVATE_UPLOAD_ACCESS_KEY_ID="your-r2-access-key-id"
NEXT_PRIVATE_UPLOAD_SECRET_ACCESS_KEY="your-r2-secret-access-key"
NEXT_PRIVATE_UPLOAD_FORCE_PATH_STYLE="false"
```

4. Enable Public Access Domain (optional) for CDN:
   - Cloudflare Dashboard → R2 → Your Bucket → Settings → Public Access
   - Connect a custom domain or use R2.dev subdomain

### Option 3: MinIO (Self-Hosted S3)

**Benefits:**
- ✅ Keep data on your own servers
- ✅ S3-compatible API
- ✅ No cloud costs
- ⚠️ Requires server management

**Setup:**

1. **Install MinIO**
```bash
# Using Docker
docker run -d \
  -p 9000:9000 \
  -p 9001:9001 \
  --name minio \
  -v /data/minio:/data \
  -e MINIO_ROOT_USER=minioadmin \
  -e MINIO_ROOT_PASSWORD=minioadmin123 \
  quay.io/minio/minio server /data --console-address ":9001"
```

2. **Create Bucket**
   - Access MinIO Console at http://localhost:9001
   - Create bucket "signdex-documents"
   - Set Access Policy to private

3. **Configure CORS**
```xml
<CORSConfiguration>
  <CORSRule>
    <AllowedOrigin>https://demo.signdex.ai</AllowedOrigin>
    <AllowedMethod>GET</AllowedMethod>
    <AllowedMethod>HEAD</AllowedMethod>
    <AllowedHeader>*</AllowedHeader>
    <ExposeHeader>Content-Length</ExposeHeader>
    <ExposeHeader>Content-Range</ExposeHeader>
    <ExposeHeader>Accept-Ranges</ExposeHeader>
    <MaxAgeSeconds>3600</MaxAgeSeconds>
  </CORSRule>
</CORSConfiguration>
```

4. **Update .env Configuration**
```env
NEXT_PUBLIC_UPLOAD_TRANSPORT="s3"

# MinIO Configuration (Current settings in your .env)
NEXT_PRIVATE_UPLOAD_ENDPOINT="http://127.0.0.1:9002"
NEXT_PRIVATE_UPLOAD_REGION="us-east-1"
NEXT_PRIVATE_UPLOAD_BUCKET="documenso"
NEXT_PRIVATE_UPLOAD_ACCESS_KEY_ID="documenso"
NEXT_PRIVATE_UPLOAD_SECRET_ACCESS_KEY="password"
NEXT_PRIVATE_UPLOAD_FORCE_PATH_STYLE="true"
```

**Note:** Your .env already has MinIO configured! You just need to:
- Start MinIO on port 9002
- Change `NEXT_PUBLIC_UPLOAD_TRANSPORT="database"` to `"s3"`

## 🔄 **MIGRATION PROCESS**

### Step 1: Set Up New Storage

Choose one option above (AWS S3, Cloudflare R2, or MinIO) and complete setup.

### Step 2: Migrate Existing PDFs from Database to S3

Create a migration script:

```typescript
// scripts/migrate-pdfs-to-s3.ts
import { prisma } from '@documenso/prisma';
import { putFileServerSide } from '@documenso/lib/universal/upload/put-file.server';
import { getFileServerSide } from '@documenso/lib/universal/upload/get-file.server';
import { DocumentDataType } from '@prisma/client';

async function migratePdfsToS3() {
  console.log('Starting PDF migration from database to S3...');
  
  // Get all documents stored in database (BYTES_64 type)
  const documentsInDb = await prisma.documentData.findMany({
    where: {
      OR: [
        { type: DocumentDataType.BYTES },
        { type: DocumentDataType.BYTES_64 }
      ]
    }
  });
  
  console.log(`Found ${documentsInDb.length} documents in database`);
  
  let migrated = 0;
  let failed = 0;
  
  for (const doc of documentsInDb) {
    try {
      console.log(`Migrating document ${doc.id}...`);
      
      // Get PDF data from database
      const pdfBytes = await getFileServerSide({
        type: doc.type,
        data: doc.data
      });
      
      // Upload to S3
      const s3Result = await putFileServerSide({
        data: pdfBytes,
        type: 'application/pdf'
      });
      
      // Update document data record
      await prisma.documentData.update({
        where: { id: doc.id },
        data: {
          type: DocumentDataType.S3_PATH,
          data: s3Result.data, // S3 key
          // Keep initialData as backup
        }
      });
      
      migrated++;
      console.log(`✓ Migrated ${doc.id} to ${s3Result.data}`);
      
    } catch (error) {
      failed++;
      console.error(`✗ Failed to migrate ${doc.id}:`, error);
    }
  }
  
  console.log(`\nMigration complete!`);
  console.log(`  Migrated: ${migrated}`);
  console.log(`  Failed: ${failed}`);
  console.log(`  Total: ${documentsInDb.length}`);
}

migratePdfsToS3().catch(console.error);
```

**Run Migration:**
```bash
# Backup database first!
pg_dump -h 127.0.0.1 -U documenso -d documenso > backup_before_migration.sql

# Run migration script
npx tsx scripts/migrate-pdfs-to-s3.ts
```

### Step 3: Update .env and Restart

```bash
# Edit .env
nano /opt/documenso/.env

# Change:
# NEXT_PUBLIC_UPLOAD_TRANSPORT="database"
# To:
NEXT_PUBLIC_UPLOAD_TRANSPORT="s3"

# Restart service
sudo systemctl restart documenso
```

### Step 4: Verify

1. Upload a new test document
2. Check it appears in S3 bucket
3. Verify PDF loads quickly
4. Check browser network tab shows:
   - `Accept-Ranges: bytes` header
   - Fast first-byte time
   - Proper caching headers

## 📊 **Expected Performance Improvements**

### Before (Database Storage)
- **First page load:** 5-10 seconds
- **Full PDF download:** 10-30 seconds (for 50 page PDF)
- **Memory usage:** High (database + app server)
- **Concurrent users:** Limited by database connections
- **Caching:** None (must query DB each time)

### After (S3 + CDN Storage)
- **First page load:** 0.5-2 seconds ⚡ (80-90% faster)
- **Full PDF download:** 2-5 seconds (progressive loading)
- **Memory usage:** Low (offloaded to S3)
- **Concurrent users:** Unlimited (CDN scaling)
- **Caching:** Browser + CDN (subsequent loads instant)

### After (S3 + CDN + Virtualized Viewer)
- **First page load:** 0.5-1 second ⚡
- **Scrolling through 500 pages:** Smooth 60 FPS
- **Memory usage:** ~50-100 MB (vs 500+ MB before)
- **Large PDF support:** Works reliably with 1000+ pages

## 🚨 **IMMEDIATE ACTION ITEMS**

### Quick Win (1-2 hours):

**If you have MinIO configured (settings already in .env):**

1. Start MinIO:
```bash
docker run -d \
  -p 9002:9002 \
  -p 9003:9003 \
  --name minio \
  -v /data/minio:/data \
  -e MINIO_ROOT_USER=documenso \
  -e MINIO_ROOT_PASSWORD=password \
  quay.io/minio/minio server /data --address ":9002" --console-address ":9003"
```

2. Create bucket via MinIO Console (http://localhost:9003):
   - Login with: `documenso` / `password`
   - Create bucket: `documenso`
   - Set Access Policy: Private

3. Update .env:
```env
NEXT_PUBLIC_UPLOAD_TRANSPORT="s3"  # Change from "database"
```

4. Restart:
```bash
sudo systemctl restart documenso
```

5. Test by uploading a new document - it should load MUCH faster!

### Production Setup (Recommended for long-term):

1. Choose **AWS S3** or **Cloudflare R2**
2. Create bucket and configure (30 minutes)
3. Update .env configuration
4. Run migration script for existing PDFs
5. Set up CloudFront/CDN (optional, adds 1 hour)
6. Test thoroughly

## 💰 **Cost Comparison**

### AWS S3 Pricing (Example: 1000 users, 10GB documents)
- **Storage:** $0.23/month (10GB)
- **Requests:** ~$0.40/month (400,000 GET requests)
- **Data Transfer:** $0.90/month (10GB egress)
- **CloudFront CDN:** $0.85/month (10GB transfer)
- **Total:** ~$2.38/month

### Cloudflare R2 Pricing (Same scenario)
- **Storage:** $0.15/month (10GB)
- **Requests:** ~$0.36/month (Class A operations)
- **Data Transfer:** **$0** (Zero egress fees!)
- **CDN:** Included
- **Total:** ~$0.51/month ⚡

### Database Storage Cost (Current)
- **Database size growth:** Unlimited until disk full
- **Backup size:** Huge (includes all PDFs)
- **Performance:** Degrades over time
- **Scalability:** Limited
- **Hidden costs:** Slower load times = lost users

## 📋 **Summary**

1. **Current Issue:** PDFs stored in PostgreSQL database causing slow loads
2. **Root Cause:** Base64 encoding + database queries for every PDF view
3. **Solution:** Switch to S3-compatible storage (AWS/R2/MinIO)
4. **Expected Improvement:** 80-90% faster PDF loading
5. **Additional Benefit:** Combined with virtualized PDF viewer = perfect performance

**Recommendation:** 
- **Immediate:** Switch to MinIO (already configured in .env!) 
- **Long-term:** Migrate to AWS S3 or Cloudflare R2 for production

Once you move to S3 storage, the virtualized PDF viewer optimizations will work even better with proper range requests and streaming support!
