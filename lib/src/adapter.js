// @ts-check
import { createPool } from "mysql2/promise";
import * as Types from "../../../../myorm/lib/src/types.js";

/** 
 * @type {(connection: import('mysql2/promise').Pool) => Types.MyORMAdapter<any>} 
 */
export const adapter = (cnn) => ({
    connection: cnn,
    handleQuery: async (cmd, args) => {
        /** @type {any} */
        let [results] = await cnn.query(cmd, args);

        // in the `mysql2` adapter, $sum and $avg aggregates return a string instead of the actual number, which the library consumer may not expect.
        if(cmd.includes("$sum") || cmd.includes("$avg")) {
            results = results.map(t => {
                for(const key in t) {
                    if(key.startsWith("$sum") || key.startsWith("$avg")) {
                        t[key] = parseFloat(t[key]);
                    }
                }
                return t;
            });
        }
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
        return /** @type {any} */ (result);
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
                // only apply offset if limit was attached.
                if(limit != undefined && offset != undefined) {
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
                cmd += where;
                args = [...args, ...whereArgs];
            }
            if(groupBy != undefined && groupBy.length > 0) {
                cmd += `\n\tGROUP BY ${groupBy.join(',')}`;
            }
            if(orderBy != undefined && orderBy.length > 0) {
                cmd += `\n\tORDER BY ${orderBy.map(o => `${o.column} ${o.direction}`).join(',')}`;
            }
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
                if (!records || records.length <= 0) throw new MyORMError(`No update record was passed in to specify what columns to be updated.`);
                cmd = `UPDATE \`${mainTableName}\`\n\tSET ${Object.keys(records[0]).map(c => `\`${c}\` = ?`).join('\n\t\t,')}${where ?? ""}`;
                args = [...Object.values(records[0]), ...whereArgs ?? []];
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
                args = [...Object.keys(cases).flatMap(k => cases[k].args), ...where.getArgs(mainTableName)];
                cmd = `UPDATE \`${mainTableName}\`\n\tSET ${Object.keys(cases).map(k => `\`${k}\` = (${cases[k].cmd})`).join(',\n\t\t')}${where.toString(mainTableName)}`;
            }
            return {
                cmd,
                args
            }
        },
        forDelete: ({ records, where, whereArgs }) => {
            let cmd = "";
            let args = [];
            if(isExplicit) {
                if (!where || !whereArgs || whereArgs.length <= 0) throw new MyORMError(`No WHERE clause was defined, possibly resulting in a delete of all records.`);
                cmd = `DELETE FROM \`${mainTableName}\`${where}`;
                args = whereArgs;
            } else {
                if (!primaryKey) throw new MyORMError(`No primary key was found to be on this table.`);
                if (!records || records.length <= 0) throw new MyORMError(`No records were given to delete.`);
                const ids = records.map(r => primaryKey in r ? r[primaryKey] : undefined).filter(r => r !== undefined);
                const where = Where(primaryKey, mainTableName, Relationships);
                where.in(ids);

                cmd = `DELETE FROM \`${mainTableName}\`${where.toString(mainTableName)}`;
                args = where.getArgs(mainTableName);
            }
            return {
                cmd,
                args
            }
        },
        forDescribe: ({ table }) => {
            return {
                cmd: `DESCRIBE \`${table}\``,
                args: []
            }
        },
        forTruncate: () => {
            return {
                cmd: `TRUNCATE TABLE \`${mainTableName}\``,
                args: []
            }
        },
        forAggregates: ({ transformColForParamUse, transformColForAliasUse }) => {
            return {
                total: () => /** @type {any} */ (`COUNT(*) AS $total`),
                count: (col) => /** @type {any} */ (`COUNT(DISTINCT ${transformColForParamUse(String(col))}) AS \`$count_${transformColForAliasUse(String(col))}\``),
                avg: (col) => /** @type {any} */ (`AVG(${transformColForParamUse(String(col))}) AS \`$avg_${transformColForAliasUse(String(col))}\``),
                max: (col) => /** @type {any} */ (`MAX(${transformColForParamUse(String(col))}) AS \`$max_${transformColForAliasUse(String(col))}\``),
                min: (col) => /** @type {any} */ (`MIN(${transformColForParamUse(String(col))}) AS \`$min_${transformColForAliasUse(String(col))}\``),
                sum: (col) => /** @type {any} */ (`SUM(${transformColForParamUse(String(col))}) AS \`$sum_${transformColForAliasUse(String(col))}\``)
            }
        }
    }) 
});

export const createMySql2Pool = createPool;

