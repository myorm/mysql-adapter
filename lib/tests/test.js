//@ts-check
import { MyORMContext } from "../../../../myorm/lib/src/contexts.js";
import { adapter, createMySql2Pool } from "../src/adapter.js";
import { config } from 'dotenv';

config();
const dbCfg = { 
    database: process.env.DB_DB, 
    host: process.env.DB_HOST, 
    user: process.env.DB_USER, 
    password: process.env.DB_PASS, 
    port: parseInt(process.env.DB_PORT ?? "3306") 
};
async function test() {
    const pool = createMySql2Pool(dbCfg);
    const myAdapter = adapter(pool);
    /** @type {MyORMContext<import('../../../../myorm/.github/chinook-setup/chinook-types.js').Track>}*/
    const ctx = new MyORMContext(myAdapter, "Track");

    ctx.hasOne(m => m.PlaylistTrack.withKeys("TrackId", "TrackId")
        .andThatHasOne(m => m.Playlist.withKeys("PlaylistId", "PlaylistId")));

    ctx.onSuccess(({ cmdRaw, cmdSanitized }) => {
        console.log(cmdRaw, '\n', cmdSanitized);
    });

    ctx.onFail(({ cmdRaw, cmdSanitized }) => {
        console.log(cmdRaw, '\n', cmdSanitized);
    });

    const records = await ctx
        .include(m => m.PlaylistTrack
            .thenInclude(m => m.Playlist))
        .groupBy((m, { avg, sum }) => [
            m.Bytes, 
            m.PlaylistTrack.Playlist.Name, 
            sum(m.PlaylistTrack.Playlist.Name), 
            sum(m.Bytes), 
            avg(m.Bytes)
        ])
        .select();
    console.log(records);
    console.log(records[0].$sum_PlaylistTrack_Playlist_Name);
    process.exit(1);
}

test();