//@ts-check
import { MyORMContext } from "../../../../myorm/lib/src/contexts.js";
import { adapter, createMySql2Pool } from "../src/adapter.js";

async function test() {
    const pool = createMySql2Pool({ database: "chinook", host: "192.168.1.9", user: "root", password: "root", port: 10500 });
    const myAdapter = adapter(pool);
    /** @type {MyORMContext<import('../../../../myorm/.github/chinook-setup/chinook-types.js').Track>}*/
    const ctx = new MyORMContext(myAdapter, "Track");

    ctx.hasOne(m => m.Album.withKeys("AlbumId", "AlbumId"));

    ctx.onSuccess(({ cmdRaw, cmdSanitized }) => {
        console.log({ cmdRaw, cmdSanitized });
    });

    ctx.onFail(({ cmdRaw, cmdSanitized }) => {
        console.log({ cmdRaw, cmdSanitized });
    });

    const records = await ctx
        .include(m => m.Album)
        .groupBy((m, { avg }) => [m.Bytes, avg(m.Bytes)])
        .select();
    records[0]
    
    process.exit(1);
}

test();