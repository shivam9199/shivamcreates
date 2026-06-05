import { v2 as cloudinary } from 'cloudinary';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// Load environment variables
dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Configure Cloudinary
const { CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET } = process.env;

if (!CLOUDINARY_CLOUD_NAME || !CLOUDINARY_API_KEY || !CLOUDINARY_API_SECRET) {
  console.error('❌ Error: Cloudinary credentials missing in .env file!');
  process.exit(1);
}

cloudinary.config({
  cloud_name: CLOUDINARY_CLOUD_NAME,
  api_key: CLOUDINARY_API_KEY,
  api_secret: CLOUDINARY_API_SECRET,
  secure: true
});

const uploadVideo = async (filePath, publicId) => {
  console.log(`\n⏳ Uploading ${filePath} to Cloudinary as "${publicId}"...`);
  return new Promise((resolve, reject) => {
    cloudinary.uploader.upload_large(
      filePath,
      {
        resource_type: 'video',
        public_id: publicId,
        overwrite: true,
        chunk_size: 5500000, // 5.5MB chunks (must be > 5MB for Cloudinary)
        timeout: 1200000 // 20 minutes timeout
      },
      (error, result) => {
        if (error) {
          console.error(`❌ Cloudinary API error:`, error);
          reject(error);
        } else if (!result || !result.secure_url) {
          console.error(`❌ Cloudinary returned empty result or no secure_url.`);
          reject(new Error('Invalid Cloudinary upload response'));
        } else {
          console.log(`✅ Uploaded successfully: ${result.secure_url}`);
          
          let optimizedUrl = result.secure_url;
          if (optimizedUrl.includes('/video/upload/')) {
            optimizedUrl = optimizedUrl.replace('/video/upload/', '/video/upload/f_auto,q_auto/');
          } else {
            optimizedUrl = `https://res.cloudinary.com/${CLOUDINARY_CLOUD_NAME}/video/upload/f_auto,q_auto/${publicId}`;
          }
          
          console.log(`✨ Optimized URL: ${optimizedUrl}`);
          resolve(optimizedUrl);
        }
      }
    );
  });
};

const main = async () => {
  const htmlPath = path.join(__dirname, 'index.html');
  const backupPath = path.join(__dirname, 'index.html.bak');
  
  if (!fs.existsSync(htmlPath)) {
    console.error(`❌ Error: index.html not found at ${htmlPath}`);
    process.exit(1);
  }
  
  // Create backup of current state
  fs.copyFileSync(htmlPath, backupPath);
  console.log(`📂 Created backup of index.html at ${backupPath}`);
  
  let htmlContent = fs.readFileSync(htmlPath, 'utf8');
  
  // Define local videos to upload and replace
  const videos = [
    { localPath: './public/videos/before/reel1.mp4', folder: 'before', name: 'reel1' },
    { localPath: './public/videos/after/reel1.mp4', folder: 'after', name: 'reel1' },
    { localPath: './public/videos/before/reel2.mp4', folder: 'before', name: 'reel2' },
    { localPath: './public/videos/after/reel2.mp4', folder: 'after', name: 'reel2' },
    { localPath: './public/videos/before/reel3.mp4', folder: 'before', name: 'reel3' },
    { localPath: './public/videos/after/reel3.mp4', folder: 'after', name: 'reel3' },
    { localPath: './public/videos/before/reel4.mp4', folder: 'before', name: 'reel4' },
    { localPath: './public/videos/after/reel4.mp4', folder: 'after', name: 'reel4' },
    { localPath: './public/videos/before/reel5.mp4', folder: 'before', name: 'reel5' },
    { localPath: './public/videos/after/reel5.mp4', folder: 'after', name: 'reel5' },
    { localPath: './public/videos/before/reel6.mp4', folder: 'before', name: 'reel6' },
    { localPath: './public/videos/after/reel6.mp4', folder: 'after', name: 'reel6' }
  ];
  
  let successCount = 0;
  
  for (const video of videos) {
    const escapedLocalPath = video.localPath.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    
    // Pattern to match either double or single quotes local path
    const localRegex = new RegExp(`src=["']${escapedLocalPath}["']`, 'g');
    
    // Pattern to match previously uploaded Cloudinary path under "portfolio_videos/folder/name.mp4"
    const oldCloudinaryRegex = new RegExp(`src=["']https://res\\.cloudinary\\.com/${CLOUDINARY_CLOUD_NAME}/video/upload/[^"']+/portfolio_videos/${video.folder}/${video.name}\\.mp4["']`, 'g');
    
    const hasLocalMatch = localRegex.test(htmlContent);
    const hasOldCloudinaryMatch = oldCloudinaryRegex.test(htmlContent);
    
    // Reset regex index states
    localRegex.lastIndex = 0;
    oldCloudinaryRegex.lastIndex = 0;
    
    if (!hasLocalMatch && !hasOldCloudinaryMatch) {
      console.log(`ℹ️ Reference for ${video.folder}/${video.name} already using new name or replaced. Skipping.`);
      continue;
    }
    
    const absoluteFilePath = path.join(__dirname, video.localPath);
    if (!fs.existsSync(absoluteFilePath)) {
      console.warn(`⚠️ Warning: Local file not found: ${absoluteFilePath}`);
      continue;
    }
    
    // New naming convention: portfolio_videos/before_reel1 or portfolio_videos/after_reel1
    const newPublicId = `portfolio_videos/${video.folder}_${video.name}`;
    
    try {
      const cloudinaryUrl = await uploadVideo(absoluteFilePath, newPublicId);
      
      // Update HTML content (replace either the local path or the old Cloudinary path)
      if (hasLocalMatch) {
        htmlContent = htmlContent.replace(localRegex, `src="${cloudinaryUrl}"`);
        console.log(`✍️ Updated local reference for ${video.localPath} to ${newPublicId}`);
      }
      if (hasOldCloudinaryMatch) {
        htmlContent = htmlContent.replace(oldCloudinaryRegex, `src="${cloudinaryUrl}"`);
        console.log(`✍️ Updated old Cloudinary reference for ${video.folder}/${video.name} to ${newPublicId}`);
      }
      
      successCount++;
    } catch (err) {
      console.error(`❌ Skipping replacement for ${video.localPath} due to upload error.`);
    }
  }
  
  // Save updated HTML
  fs.writeFileSync(htmlPath, htmlContent, 'utf8');
  console.log(`\n🎉 Process complete! Successfully updated ${successCount} references in index.html to the new distinguished naming format.`);
};

main().catch(err => {
  console.error('❌ Critical error in upload execution:', err);
});
