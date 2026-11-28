import type { Readable } from 'node:stream';

export interface DriveFolder {
  id: string;
  name: string;
}

export interface DriveImage {
  id: string;
  name: string;
  mime: string;
  size: number;
  md5: string | null;
}

export interface ScannedChapter {
  driveFolderId: string;
  /** Display name, with any numeric ordering prefix removed */
  name: string;
  sort: number;
  images: DriveImage[];
}

export interface FolderScan {
  folder: DriveFolder;
  /** Images directly inside the client folder (no chapter) */
  looseImages: DriveImage[];
  chapters: ScannedChapter[];
  photoCount: number;
  totalBytes: number;
}

/** One level of the photo library, for browsing in the Studio */
export interface FolderListing {
  folder: DriveFolder;
  /** From the library root down to this folder, both included */
  path: DriveFolder[];
  /** Direct subfolders: dated ones newest first, the rest in natural order */
  folders: DriveFolder[];
  /** Usable photos directly inside this folder */
  imageCount: number;
  imageBytes: number;
  /** Other files directly inside (RAW, HEIC, video…), which albums skip */
  otherFiles: number;
}

export interface FolderHit extends DriveFolder {
  /** From the library root down to the folder, both included */
  path: DriveFolder[];
}

export interface DriveSource {
  /** One folder of the library (the root when no id is given) */
  listFolder(folderId?: string): Promise<FolderListing>;
  /** Folders anywhere in the library whose name contains the text */
  searchFolders(text: string): Promise<FolderHit[]>;
  /** One album folder: its images, and subfolders as chapters */
  scanFolder(folderId: string): Promise<FolderScan>;
  /** Stream an original file, untouched */
  openOriginal(fileId: string): Promise<Readable>;
  /** A small JPEG/WebP thumbnail, for picking a cover in the Studio */
  thumbnail(fileId: string): Promise<Buffer | null>;
}

export const IMAGE_MIME = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/tiff', 'image/avif']);
