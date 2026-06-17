// src/services/googleDrive.js
const { google } = require('googleapis');
const { Readable } = require('stream');

let driveInstance = null;

function getDrive() {
  if (driveInstance) return driveInstance;
  const auth = new google.auth.GoogleAuth({
    credentials: {
      client_email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
      private_key: process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
    },
    scopes: ['https://www.googleapis.com/auth/drive'],
  });
  driveInstance = google.drive({ version: 'v3', auth });
  return driveInstance;
}

async function findFolder(name, parentId) {
  const drive = getDrive();
  const res = await drive.files.list({
    q: `name='${name}' and '${parentId}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`,
    fields: 'files(id, name)',
    spaces: 'drive',
  });
  return res.data.files[0]?.id || null;
}

async function createFolder(name, parentId) {
  const drive = getDrive();
  const res = await drive.files.create({
    requestBody: {
      name,
      mimeType: 'application/vnd.google-apps.folder',
      parents: [parentId],
    },
    fields: 'id',
  });
  return res.data.id;
}

async function getOrCreateFolder(name, parentId) {
  const existing = await findFolder(name, parentId);
  if (existing) return existing;
  return createFolder(name, parentId);
}

async function getOrCreateClientFolder(clientName) {
  const rootId = process.env.DRIVE_ROOT_FOLDER_ID;
  return getOrCreateFolder(clientName, rootId);
}

async function uploadFile(clientFolderId, subFolderName, fileBuffer, fileName, mimeType) {
  const drive = getDrive();
  const subFolderId = await getOrCreateFolder(subFolderName, clientFolderId);

  const res = await drive.files.create({
    requestBody: {
      name: fileName,
      parents: [subFolderId],
    },
    media: {
      mimeType,
      body: Readable.from(fileBuffer),
    },
    fields: 'id, webViewLink, name',
  });

  // Make readable by anyone with the link (optional — remove for private)
  await drive.permissions.create({
    fileId: res.data.id,
    requestBody: { role: 'reader', type: 'anyone' },
  });

  return {
    driveFileId: res.data.id,
    driveUrl: res.data.webViewLink,
    driveFolderName: subFolderName,
  };
}

async function deleteFile(driveFileId) {
  const drive = getDrive();
  await drive.files.delete({ fileId: driveFileId });
}

async function listClientFiles(clientFolderId) {
  const drive = getDrive();
  const res = await drive.files.list({
    q: `'${clientFolderId}' in parents and trashed=false`,
    fields: 'files(id, name, webViewLink, mimeType, size)',
  });
  return res.data.files;
}

module.exports = {
  getOrCreateClientFolder,
  uploadFile,
  deleteFile,
  listClientFiles,
};
