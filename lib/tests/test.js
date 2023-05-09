//@ts-check
import { MyORMContext } from "../../../../myorm/lib/src/contexts.js";
import { adapter, createMySql2Pool } from "../src/adapter.js";

async function test() {
    const pool = createMySql2Pool({ database: "digital_media_store", host: "chorecharge.com", user: "root", password: "root", port: 10030 });
    const myAdapter = adapter(pool);
    /** @type {MyORMContext<import('../../../../myorm/.github/chinook-setup/chinook-types.js').Track>}*/
    const ctx = new MyORMContext(myAdapter, "Track");

    ctx.onSuccess(({ cmdRaw }) => {
        console.log(cmdRaw);
    });

    ctx.onFail(({ cmdRaw, cmdSanitized }) => {
        console.log(cmdRaw);
    });

    const records = await ctx
        .groupBy((m, aggr) => [m.Composer, aggr.avg(m.Bytes)])
        .sortBy(m => m.Composer.asc())
        .take(20)
        .select();
    console.log(records);
    process.exit(1);
}

test();