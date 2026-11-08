'use strict';
const {parentPort,workerData}=require('node:worker_threads');
const {readDocument,AttachmentError}=require('./attachments.cjs');
readDocument(Buffer.from(workerData.bytes),workerData.extension).then(text=>parentPort.postMessage({text})).catch(error=>parentPort.postMessage({error:error instanceof AttachmentError?error.message:'无法提取文件正文，请确认文件未加密且格式正确。'}));
