import {open,lstat,mkdir,readdir,link,unlink,realpath} from 'node:fs/promises';
import {constants} from 'node:fs';
import {join} from 'node:path';
import {createHash,randomUUID} from 'node:crypto';
import {crc32} from 'node:zlib';

const MAX_BYTES=16*1024*1024,MAX_PIXELS=16_000_000,MAX_COUNT=128;
const SIGNATURE=Buffer.from([137,80,78,71,13,10,26,10]);
const digest=b=>createHash('sha256').update(b).digest('hex');
const idPattern=/^[a-f0-9]{64}$/;
export function inspectPng(bytes){
  if(!Buffer.isBuffer(bytes)||bytes.length<45||bytes.length>MAX_BYTES||!bytes.subarray(0,8).equals(SIGNATURE))throw Error('Invalid or oversized PNG');
  let offset=8,width,height,seenData=false,closedData=false,count=0;
  while(offset+12<=bytes.length){
    if(++count>4096)throw Error('Too many PNG chunks');
    const length=bytes.readUInt32BE(offset),end=offset+12+length;
    if(end>bytes.length)throw Error('Truncated PNG chunk');
    const type=bytes.toString('ascii',offset+4,offset+8),data=bytes.subarray(offset+8,end-4);
    if(!/^[A-Za-z]{4}$/.test(type)||crc32(bytes.subarray(offset+4,end-4))!==bytes.readUInt32BE(end-4))throw Error('Invalid PNG chunk or CRC');
    if(count===1){
      if(type!=='IHDR'||length!==13)throw Error('Missing PNG IHDR');
      width=data.readUInt32BE(0);height=data.readUInt32BE(4);
      const depth=data[8],color=data[9],valid={0:[1,2,4,8,16],2:[8,16],3:[1,2,4,8],4:[8,16],6:[8,16]};
      if(!width||!height||width>8192||height>8192||width*height>MAX_PIXELS||!valid[color]?.includes(depth)||data[10]||data[11]||data[12]>1)throw Error('Unsupported PNG geometry or encoding');
    }else if(type==='IHDR'||['acTL','fcTL','fdAT'].includes(type))throw Error('Duplicate header or animated PNG unsupported');
    else if(type==='IDAT'){if(closedData)throw Error('Nonconsecutive PNG data');seenData=true;}
    else{
      if(seenData)closedData=true;
      if(type==='IEND'){
        if(length||!seenData||end!==bytes.length)throw Error('Invalid PNG end');
        return {width,height,byteLength:bytes.length};
      }
      if(type[0]===type[0].toUpperCase()&&type!=='PLTE')throw Error('Unknown critical PNG chunk');
    }
    offset=end;
  }
  throw Error('Missing PNG end');
}
async function readBounded(path){
  const s=await lstat(path);
  if(!s.isFile()||s.isSymbolicLink()||s.nlink!==1||s.size>MAX_BYTES)throw Error('Expected a bounded regular unlinked PNG');
  const f=await open(path,constants.O_RDONLY|constants.O_NONBLOCK|(constants.O_NOFOLLOW??0));
  try{
    const st=await f.stat();if(!st.isFile()||st.nlink!==1||st.size>MAX_BYTES)throw Error('Unsafe image file');
    const chunks=[];let total=0;
    for(;;){const buf=Buffer.alloc(65536),{bytesRead}=await f.read(buf);if(!bytesRead)break;total+=bytesRead;if(total>MAX_BYTES)throw Error('Image exceeds size limit');chunks.push(buf.subarray(0,bytesRead));}
    return Buffer.concat(chunks,total);
  }finally{await f.close();}
}
export function projectImages(root){
  async function directory(create=false){
    let dir=await realpath(root);
    for(const name of ['assets','images']){
      dir=join(dir,name);
      if(create)try{await mkdir(dir,{mode:0o755});}catch(e){if(e.code!=='EEXIST')throw e;}
      try{const s=await lstat(dir);if(!s.isDirectory()||s.isSymbolicLink())throw Error('Unsafe project image directory');}catch(e){if(e.code==='ENOENT'&&!create)return null;throw e;}
    }
    return dir;
  }
  async function read(id){
    if(typeof id!=='string'||!idPattern.test(id))throw Error('Invalid image ID');
    const dir=await directory();if(!dir)throw Error('Image directory missing');
    const bytes=await readBounded(join(dir,id+'.png'));
    if(digest(bytes)!==id)throw Error('Image hash mismatch');
    return {id,...inspectPng(bytes),bytes};
  }
  async function list(){
    const dir=await directory();if(!dir)return [];
    const names=(await readdir(dir)).filter(n=>/^[a-f0-9]{64}\.png$/.test(n)).sort();
    if(names.length>MAX_COUNT)throw Error('Image catalog limit exceeded');
    const out=[];
    for(const name of names){const {bytes,...info}=await read(name.slice(0,-4));out.push(info);}
    return out;
  }
  async function add(source){
    const bytes=await readBounded(source),info=inspectPng(bytes),id=digest(bytes);
    const dir=await directory(true),destination=join(dir,id+'.png');
    try{await read(id);return {id,...info,duplicate:true};}catch(e){if(e.code!=='ENOENT')throw e;}
    if((await readdir(dir)).filter(n=>/^[a-f0-9]{64}\.png$/.test(n)).length>=MAX_COUNT)throw Error('Image catalog limit exceeded');
    const temp=join(dir,'.import-'+randomUUID()+'.tmp');
    const f=await open(temp,'wx',0o644);
    try{
      try{await f.writeFile(bytes);await f.sync();}finally{await f.close();}
      try{await link(temp,destination);}catch(e){if(e.code!=='EEXIST')throw e;await read(id);return {id,...info,duplicate:true};}
    }finally{await unlink(temp);}
    return {id,...info,duplicate:false};
  }
  return {read,list,add};
}
