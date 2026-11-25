import {crc32,deflateSync} from 'node:zlib';
export function pngChunk(type,data){
  const body=Buffer.concat([Buffer.from(type,'ascii'),data]),out=Buffer.alloc(body.length+8);
  out.writeUInt32BE(data.length);body.copy(out,4);out.writeUInt32BE(crc32(body),out.length-4);return out;
}
export function tinyPng(){
  const header=Buffer.alloc(13);header.writeUInt32BE(2,0);header.writeUInt32BE(1,4);header[8]=8;header[9]=6;
  return Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),pngChunk('IHDR',header),pngChunk('IDAT',deflateSync(Buffer.from([0,255,0,0,255,0,0,255,255]))),pngChunk('IEND',Buffer.alloc(0))]);
}
