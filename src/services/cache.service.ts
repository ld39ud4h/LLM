import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { supabase } from "../clients/supabase.js";
import { logger } from "../config/logger.js";
type CacheRow = Record<string, unknown>;
const cachePath = process.env.CACHE_DB_PATH || "/tmp/discord-llm-cache.sqlite";
let database: DatabaseSync | undefined;
const hydrated = new Set<string>();
const dirty = new Set<string>();
function db(): DatabaseSync { if (!database) throw new Error("SQLite cache is not initialized"); return database; }
export function cacheGet<T extends CacheRow>(collection: string, key: string): T | undefined {
  if (!database || (!hydrated.has(collection) && !dirty.has(collection))) return undefined;
  try {
    const row = db().prepare("select payload from cache_records where collection=? and record_key=?").get(collection,key) as {payload?:string}|undefined;
    if (!row?.payload) return undefined;
    return JSON.parse(row.payload) as T;
  } catch (error) {
    logger.warn({ err: error, feature: "sqlite-cache", collection }, "Cache read failed; falling back to Supabase");
    return undefined;
  }
}
export function cacheList<T extends CacheRow>(collection: string): T[] {
  if (!database) return [];
  try {
    const rows = db().prepare("select payload from cache_records where collection=?").all(collection) as Array<{payload:string}>;
    return rows.flatMap(row => { try { return [JSON.parse(row.payload) as T]; } catch { return []; } });
  } catch (error) {
    logger.warn({ err: error, feature: "sqlite-cache", collection }, "Cache collection read failed");
    return [];
  }
}
export function isCacheHydrated(collection:string):boolean { return Boolean(database) && hydrated.has(collection); }
export function cacheSet(collection:string,key:string,value:CacheRow):void {
  if (!database) return;
  try {
    db().prepare("insert into cache_records(collection,record_key,payload,updated_at) values(?,?,?,?) on conflict(collection,record_key) do update set payload=excluded.payload,updated_at=excluded.updated_at").run(collection,key,JSON.stringify(value),new Date().toISOString());
    dirty.add(collection);
  } catch (error) {
    logger.warn({ err: error, feature: "sqlite-cache", collection }, "Cache write failed; Supabase remains authoritative");
  }
}
export function cacheDelete(collection:string,key:string):void {
  if (!database) return;
  try {
    db().prepare("delete from cache_records where collection=? and record_key=?").run(collection,key);
    dirty.add(collection);
  } catch (error) {
    logger.warn({ err: error, feature: "sqlite-cache", collection }, "Cache deletion failed; Supabase remains authoritative");
  }
}
function cacheReplaceCollection(collection:string,rows:Array<{key:string;value:CacheRow}>):void {
  if (!database) return;
  const connection=db();
  const insert=connection.prepare("insert into cache_records(collection,record_key,payload,updated_at) values(?,?,?,?)");
  connection.exec("begin");
  try {
    connection.prepare("delete from cache_records where collection=?").run(collection);
    const now=new Date().toISOString();
    for(const row of rows) insert.run(collection,row.key,JSON.stringify(row.value),now);
    connection.exec("commit"); hydrated.add(collection); dirty.delete(collection);
  } catch(error) { connection.exec("rollback"); throw error; }
}
async function hydrateCollection(table:string,keyColumn:string,maxRows=Number.POSITIVE_INFINITY):Promise<number>{
  const rows:CacheRow[]=[]; const pageSize=500;
  for(let offset=0;offset<maxRows;offset+=pageSize){
    const end=Math.min(offset+pageSize,maxRows)-1;
    const {data,error}=await supabase.from(table).select("*").order(table==="messages"?"created_at":keyColumn,{ascending:table!=="messages"}).range(offset,end);
    if(error) throw error;
    const page=(data??[]) as CacheRow[]; rows.push(...page);
    if(page.length<pageSize||rows.length>=maxRows) break;
  }
  cacheReplaceCollection(table,rows.map(row=>({key:String(row[keyColumn]),value:row})));
  return rows.length;
}
export async function initializeLocalCache():Promise<void>{
  mkdirSync(dirname(cachePath),{recursive:true});
  database=new DatabaseSync(cachePath);
  database.exec("pragma journal_mode=WAL; pragma synchronous=NORMAL; pragma busy_timeout=5000; create table if not exists cache_records(collection text not null,record_key text not null,payload text not null,updated_at text not null,primary key(collection,record_key)); create index if not exists idx_cache_collection on cache_records(collection);");
  const collections:Array<[string,string,number?]>=[["discord_users","discord_id"],["conversations","id"],["messages","id",5000],["user_memories","id"],["guild_settings","guild_id"],["user_personas","discord_user_id"],["ai_runtime_state","state_key"]];
  const results=await Promise.allSettled(collections.map(([table,key,limit])=>hydrateCollection(table,key,limit)));
  let total=0;
  results.forEach((result,index)=>{if(result.status==="fulfilled") total+=result.value; else logger.warn({err:result.reason,feature:"sqlite-cache",collection:collections[index]?.[0]},"Could not hydrate local cache collection");});
  logger.info({feature:"sqlite-cache",cachePath,cachedRecords:total,hydratedCollections:[...hydrated]},"Local SQLite cache initialized from Supabase");
}
export function closeLocalCache():void { database?.close(); database=undefined; }
