import { v2 as cloudinary } from 'cloudinary';
import { Readable } from 'stream';
import { config } from '../config/env.js';

// Configure Cloudinary
cloudinary.config({
  cloud_name: config.CLOUDINARY_CLOUD_NAME,
  api_key: config.CLOUDINARY_API_KEY,
  api_secret: config.CLOUDINARY_API_SECRET
});

/**
 * Cloudinary Service - Handles image uploads and management
 */
class CloudinaryService {
  
  /**
   * Upload image buffer to Cloudinary
   * @param {Buffer} buffer - Image buffer
   * @param {Object} options - Upload options
   * @returns {Promise<Object>} Upload result with secure_url
   */
  async uploadBuffer(buffer, options = {}) {
    const defaultOptions = {
      folder: 'aroura/profile-pictures',
      resource_type: 'image',
      transformation: [
        { width: 400, height: 400, crop: 'fill', gravity: 'face' },
        { quality: 'auto:good' },
        { format: 'webp' }
      ]
    };
    
    const uploadOptions = { ...defaultOptions, ...options };
    
    return new Promise((resolve, reject) => {
      const uploadStream = cloudinary.uploader.upload_stream(
        uploadOptions,
        (error, result) => {
          if (error) {
            reject(error);
          } else {
            resolve(result);
          }
        }
      );
      
      // Write buffer to stream
      const stream = Readable.from(buffer);
      stream.pipe(uploadStream);
    });
  }
  
  /**
   * Upload from URL (for OAuth profile pictures)
   * @param {string} url - Image URL
   * @param {string} userId - User ID for folder organization
   * @returns {Promise<Object>} Upload result
   */
  async uploadFromUrl(url, userId) {
    try {
      const result = await cloudinary.uploader.upload(url, {
        folder: 'aroura/profile-pictures',
        public_id: `user_${userId}`,
        overwrite: true,
        resource_type: 'image',
        transformation: [
          { width: 400, height: 400, crop: 'fill', gravity: 'face' },
          { quality: 'auto:good' },
          { format: 'webp' }
        ]
      });
      
      return result;
    } catch (error) {
      console.error('Cloudinary URL upload error:', error);
      // Return the original URL if Cloudinary upload fails
      return { secure_url: url };
    }
  }
  
  /**
   * Delete image from Cloudinary
   * @param {string} publicId - Cloudinary public ID
   * @returns {Promise<Object>}
   */
  async deleteImage(publicId) {
    try {
      return await cloudinary.uploader.destroy(publicId);
    } catch (error) {
      console.error('Cloudinary delete error:', error);
      throw error;
    }
  }
  
  /**
   * Extract public ID from Cloudinary URL
   * @param {string} url - Cloudinary URL
   * @returns {string|null} Public ID
   */
  extractPublicId(url) {
    if (!url || !url.includes('cloudinary')) return null;
    
    try {
      // Extract path after /upload/
      const match = url.match(/\/upload\/(?:v\d+\/)?(.+?)\.\w+$/);
      return match ? match[1] : null;
    } catch {
      return null;
    }
  }
  
  /**
   * Generate optimized URL with transformations
   * @param {string} publicId - Cloudinary public ID
   * @param {Object} options - Transformation options
   * @returns {string} Optimized URL
   */
  getOptimizedUrl(publicId, options = {}) {
    const defaultTransformations = {
      width: 200,
      height: 200,
      crop: 'fill',
      gravity: 'face',
      quality: 'auto:good',
      format: 'webp'
    };
    
    return cloudinary.url(publicId, { 
      ...defaultTransformations, 
      ...options 
    });
  }
}

export default new CloudinaryService();
