// @ts-check
import { MyORMContext } from "../../myorm/lib/src/contexts.js";
import { createPool } from "mysql2/promise";
import * as Types from "../../myorm/lib/src/types.js";

/** 
 * @type {(connection: import('mysql2/promise').Pool) => Types.MyORMAdapter<any>} 
 */
export const adapter = (cnn) => ({
    connection: cnn,
    handleQuery: async (cmd, args) => {
        /** @type {any} */
        const results = await cnn.query(cmd, args);
        return results;
    },
    handleCount: async (cmd, args) => {
        const [results] = await cnn.query(cmd, args);
        return results[0].$$count;
    },
    handleInsert: async (cmd, args) => {
        const [result] = /** @type {import('mysql2/promise').ResultSetHeader[]} */ (await cnn.execute(cmd, args));
        return Array.from(Array(result.affectedRows).keys()).map((_, n) => n + result.insertId);
    },
    handleUpdate: async (cmd, args) => {
        const [result] = /** @type {import('mysql2/promise').ResultSetHeader[]} */ (await cnn.execute(cmd, args));
        return result.affectedRows;
    },
    handleDelete: async (cmd, args) => {
        const [result] = /** @type {import('mysql2/promise').ResultSetHeader[]} */ (await cnn.execute(cmd, args));
        return result.affectedRows;
    },
    handleDescribe: async (cmd, args) => {
        const [result] = /** @type {import('mysql2/promise').ResultSetHeader[]} */ (await cnn.execute(cmd, args));
        return result.affectedRows;
    },
    onSerialization: ({ MyORMError, Where, Relationships }, { mainTableName, primaryKey, isIdentityKey, isExplicit, isCount, hasOneToMany }) => ({
        forQuery: ({ selects, from, where, groupBy, orderBy, limit, offset, whereArgs }) => {
            let cmd = `SELECT ${selects.join('\n\t\t,')}`;
            let args = [];
            if(selects.length <= 0) cmd = `SELECT *`;
            if(isCount) cmd = `SELECT COUNT(*) AS $$count`;
            if (hasOneToMany && limit != undefined) {
                let [mainTable] = from; 
                mainTable = `(SELECT * FROM \`${from[0]}\``;
                if(where != undefined && whereArgs != undefined) {
                    mainTable += `\n\t\t${where}`;
                    args = [...args, ...whereArgs];
                }
                mainTable += `\n\t\t\tLIMIT ?`;
                args = [...args, limit];
                if(offset != undefined) {
                    mainTable += `\n\t\tOFFSET ?`;
                    args = [...args, offset];
                }
                limit = undefined;
                offset = undefined;
                mainTable += `) AS \`${mainTableName}\``
                from = [mainTable, ...from.splice(1, from.length)];
            }
            cmd += `\n\tFROM ${from.join('\n\t\tLEFT JOIN ')}`;
            if (where != undefined && whereArgs != undefined) {
                cmd += `\n${where}`;
                args = [...args, ...whereArgs];
            }
            if(groupBy != undefined && groupBy.length > 0) cmd += `\n\tGROUP BY ${groupBy}`;
            if(orderBy != undefined && orderBy.length > 0) cmd += `\n\tORDER BY ${orderBy}`;
            if(limit != undefined) {
                cmd += `\n\tLIMIT ?`;
                args = [...args, limit];
            }
            if(offset != undefined) {
                cmd += `\n\tOFFSET ?`;
                args = [...args, offset];
            }
            return { cmd, args };
        },
        forInsert: ({ columns, values }) => {
            let cmd = `INSERT INTO ${mainTableName} (${columns.join(',')}) VALUES ${values.map(v => `(${v.map(_ => `?`).join(',')})`).join('\n\t\t,')}`;
            return {
                cmd,
                args: values.flatMap(v => v)
            }
        },
        forUpdate: ({ columns, records, where, whereArgs }) => {
            let cmd = "";
            let args = [];
            if(isExplicit) {
                
            } else {
                if(!primaryKey) throw new MyORMError(`No primary key was found to be on this table.`);
                if(!records || records.length <= 0) throw new MyORMError(`No records were passed in to be updated.`);
                let cases = columns.reduce((accumulator, value) => {
                    return { ...accumulator, [value]: { cmd: 'CASE\n\t\t', args: [] } };
                }, {});
                for (const record of records) {
                    if(!(primaryKey in record)) {
                        throw new MyORMError(`The primary key, "${primaryKey}" does not exist on the record, ${JSON.stringify(record)}`);
                    }
                    // Otherwise, add to the CASE clause.
                    for (const key in record) {
                        if (record[key] == undefined || (primaryKey === key && isIdentityKey)) continue; // Skip identity key, we can't nor do we want to update it.
                        cases[key].cmd += `\tWHEN ${primaryKey} = ? THEN ?\n\t\t`;
                        cases[key].args = [...cases[key].args, record[primaryKey], record[key]];
                    }
                }
                Object.keys(cases).forEach(k => cases[k].cmd += `\tELSE \`${k}\`\n\t\tEND`);
                const where = Where(primaryKey, mainTableName, Relationships);
                where.in(records.map(r => r[primaryKey]));

                // Delete the cases that have no sets.
                for (const key in cases) {
                    if (cases[key].args.length <= 0) {
                        delete cases[key];
                    }
                }
                let args = Object.keys(cases).flatMap(k => cases[k].args);
                args = [...args, ...where.getArgs(mainTableName)];
                cmd = `UPDATE \`${mainTableName}\`\n\tSET ${Object.keys(cases).map(k => `\`${k}\` = (${cases[k].cmd})`).join(',\n\t\t')}${where.toString(mainTableName)}`;
            }
            return {
                cmd,
                args
            }
        },
        forDelete: () => {
            return {
                cmd: "",
                args: []
            }
        },
        forDescribe: () => {
            return {
                cmd: "",
                args: []
            }
        }
    }) 
});

export const createMySql2Pool = createPool;

/**
 * import { MyORMContext } from '@myorm/myorm';
 * import { adapter, createPool } from '@myorm/adapters/mysql2';
 * import { graphql } from '@myorm/extensions/graphql';
 * 
 * const mySql2Pool = createPool({ ... });
 * const ctx = new MyORMContext(adapter(mySql2Pool), "MyTable");
 * 
 * const RootQueryType = graphql.createRootQueryType(ctx);
 * const RootMutationType = graphql.createRootMutationType(ctx);
 * 
 * query {
 *     users {
 *          id,
 *          firstName,
 *          lastName
 *     }
 * }
 */

async function test() {
    const pool = createMySql2Pool({ database: "chinook", host: "192.168.1.9", user: "root", password: "root", port: 10500 });
    const myAdapter = adapter(pool);
    /** @type {MyORMContext<import('../../myorm/.github/chinook-setup/chinook-types.js').Track>}*/
    const ctx = new MyORMContext(myAdapter, "Track");

    const records = await ctx.take(20).select();
}