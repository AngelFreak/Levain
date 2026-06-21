// Photo capture and storage utilities for Levain
import { Camera, CameraResultType, CameraSource } from '@capacitor/camera';
import type { Photo } from '@capacitor/camera';
import { Filesystem, Directory } from '@capacitor/filesystem';
import { Capacitor } from '@capacitor/core';

export interface SavedPhoto {
  filepath: string;
  webviewPath: string;
}

/**
 * Take a photo using the device camera or select from gallery
 */
export async function takePhoto(source: 'camera' | 'gallery' = 'camera'): Promise<Photo | null> {
  try {
    const photo = await Camera.getPhoto({
      quality: 85,
      allowEditing: false,
      resultType: CameraResultType.Uri,
      source: source === 'camera' ? CameraSource.Camera : CameraSource.Photos,
      width: 1200, // Max width to keep file size reasonable
      height: 1200, // Max height
    });
    return photo;
  } catch (error) {
    console.error('Failed to take photo:', error);
    return null;
  }
}

/**
 * Save a photo to the app's storage directory
 * Returns the saved file path and a URL for displaying in webview
 */
export async function savePhoto(photo: Photo, filename: string): Promise<SavedPhoto | null> {
  try {
    // For native platform, copy the photo to app directory
    if (Capacitor.isNativePlatform() && photo.path) {
      // Read the photo as base64
      const file = await Filesystem.readFile({
        path: photo.path,
      });

      // Generate a unique filename with timestamp
      const savedFilename = `${filename}_${Date.now()}.jpeg`;

      // Save to the app's data directory
      const savedFile = await Filesystem.writeFile({
        path: `recipes/${savedFilename}`,
        data: file.data,
        directory: Directory.Data,
        recursive: true,
      });

      // Get the webview-friendly path
      const webviewPath = Capacitor.convertFileSrc(savedFile.uri);

      return {
        filepath: savedFile.uri,
        webviewPath,
      };
    } else if (photo.webPath) {
      // For web, just use the webPath directly (temporary)
      // In production, you'd want to convert to base64 and store in IndexedDB
      return {
        filepath: photo.webPath,
        webviewPath: photo.webPath,
      };
    }

    return null;
  } catch (error) {
    console.error('Failed to save photo:', error);
    return null;
  }
}

export interface PhotoBase64 {
  /** Base64-encoded image data, WITHOUT the data: URL prefix. */
  data: string;
  /** MIME media type, e.g. "image/jpeg". */
  mediaType: 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp';
}

/**
 * Convert a freshly-captured Capacitor photo to raw base64 + media type,
 * suitable for sending to Claude's vision API. Works on both native (reads the
 * file via Filesystem) and web (fetches the webPath blob).
 */
export async function photoToBase64(photo: Photo): Promise<PhotoBase64 | null> {
  try {
    const format = (photo.format || 'jpeg').toLowerCase();
    const mediaType = (`image/${format === 'jpg' ? 'jpeg' : format}`) as PhotoBase64['mediaType'];

    // Native: read the file off disk as base64.
    if (Capacitor.isNativePlatform() && photo.path) {
      const file = await Filesystem.readFile({ path: photo.path });
      // Filesystem returns a base64 string on native (no data: prefix).
      const data = typeof file.data === 'string' ? file.data : await blobToBase64(file.data);
      return { data, mediaType };
    }

    // Web: fetch the blob URL and base64-encode it.
    if (photo.webPath) {
      const res = await fetch(photo.webPath);
      const blob = await res.blob();
      const data = await blobToBase64(blob);
      const detected = (blob.type || mediaType) as PhotoBase64['mediaType'];
      return { data, mediaType: detected };
    }

    return null;
  } catch (error) {
    console.error('Failed to convert photo to base64:', error);
    return null;
  }
}

/** Read a Blob into a base64 string with the data: prefix stripped. */
function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const result = reader.result as string;
      // result is "data:<mime>;base64,<data>" — strip the prefix.
      const comma = result.indexOf(',');
      resolve(comma >= 0 ? result.slice(comma + 1) : result);
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

/**
 * Delete a photo from storage
 */
export async function deletePhoto(filepath: string): Promise<boolean> {
  try {
    if (Capacitor.isNativePlatform()) {
      await Filesystem.deleteFile({
        path: filepath,
      });
    }
    return true;
  } catch (error) {
    console.error('Failed to delete photo:', error);
    return false;
  }
}

/**
 * Check if Camera permissions are available
 */
export async function checkCameraPermissions(): Promise<boolean> {
  try {
    const permissions = await Camera.checkPermissions();
    return permissions.camera === 'granted' && permissions.photos === 'granted';
  } catch (error) {
    console.error('Failed to check camera permissions:', error);
    return false;
  }
}

/**
 * Request Camera permissions
 */
export async function requestCameraPermissions(): Promise<boolean> {
  try {
    const permissions = await Camera.requestPermissions();
    return permissions.camera === 'granted' && permissions.photos === 'granted';
  } catch (error) {
    console.error('Failed to request camera permissions:', error);
    return false;
  }
}
