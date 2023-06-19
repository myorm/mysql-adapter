// @ts-check
import { createPool } from "mysql2/promise";

/**
 * Reduces all of the conditions built in `MyORM` to a single clause.
 * @param {import('../../../../myorm/lib/src/types.js').WhereClausePropertyArray=} conditions
 * Conditions to reduce to a clause.
 * @param {string} table
 * If specified, will only reduce conditions that belong to the specified table. (default: empty string or all conditions)
 * @param {(n: number) => string} sanitize
 * Function used to convert values to sanitized strings. (default: (n) => `?`.)
 * @returns {{cmd: string, args: import('../../../../myorm/lib/src/types.js').SQLPrimitive[]}}
 * string and array of SQL primitives to be concatenated onto the full query string and arguments.
 */
function handleWhere(conditions, table="", sanitize=(n) => `?`) {
    if(!conditions) return { cmd: '', args: [] };
    let args = [];

    // function to filter out conditions that do not belong to table.
    const mapFilter = (x) => {
        if(Array.isArray(x)) {
            const filtered = x.map(mapFilter).filter(x => x !== undefined);
            return filtered.length > 0 ? filtered : undefined;
        }
        if(x.property.includes(table)) {
            return x;
        }
        return undefined;
    }

    // function to reduce each condition to one appropriate clause string.
    const reduce = (a, b, depth=0) => {
        const tabs = Array.from(Array(depth + 2).keys()).map(_ => `\t`).join('');
        if(Array.isArray(b)) {
            const [x, ...remainder] = b;
            if(x.operator === "BETWEEN") {
                const cmd = `${a} ${remainder.reduce((a, b) => reduce(a, b, depth + 1), `${x.chain} (${x.table}.${x.property} ${x.operator} ${sanitize(args.length)} AND ${sanitize(args.length+1)}`) + `)\n${tabs}`}`;
                args = args.concat(x.value);
                return cmd;
            }
            const cmd = `${a} ${remainder.reduce((a, b) => reduce(a, b, depth + 1), `${x.chain} (${x.table}.${x.property} ${x.operator} ${Array.isArray(x.value) ? `(${x.value.map((_,n) => sanitize(args.length+n)).join(',')})` : sanitize(args.length)}`) + `)\n${tabs}`}`;
            if (Array.isArray(x.value)) {
                args = args.concat(x.value);
            } else {
                args.push(x.value);
            }
            return cmd;
        }
        if(b.operator === "BETWEEN") {
            const cmd = a + `${b.chain} ${b.table}.${b.property} ${b.operator} ${sanitize(args.length)} AND ${sanitize(args.length+1)}\n${tabs}`;
            args = args.concat(b.value);
            return cmd;
        }
        const cmd = a + `${b.chain} ${b.table}.${b.property} ${b.operator} ${Array.isArray(b.value) ? `(${b.value.map((_, n) => sanitize(args.length + n)).join(',')})` : sanitize(args.length)}\n${tabs}`;
        if (Array.isArray(b.value)) {
            args = args.concat(b.value);
        } else {
            args.push(b.value);
        }
        return cmd;
    };
    
    // map the array, filter out undefineds, then reduce the array to get the clause.
    /** @type {string} */
    const reduced = conditions.map(mapFilter).filter(x => x !== undefined).reduce(reduce, '');
    return {
        // if a filter took place, then the WHERE statement of the clause may not be there, so we replace.
        cmd: reduced.startsWith("WHERE") 
            ? reduced.trimEnd()
            : reduced.startsWith("AND") 
                ? reduced.replace("AND", "WHERE").trimEnd() 
                : reduced.replace("OR", "WHERE").trimEnd(),
        // arguments was built inside the reduce function.
        args
    };
}

// "VIRTUAL GENERATED"
// "DEFAULT_GENERATED"

function getDefaultValueFn(type, defaultValue, extra) {
    if(extra.includes("DEFAULT_GENERATED")) {
        switch(defaultValue) {
            case "CURRENT_TIMESTAMP": {
                return () => new Date;
            }
        }
    }
    if(defaultValue !== null) {
        switch(type) {
            case "int": {
                defaultValue = parseInt(defaultValue);
                break;
            }
            case "double": {
                defaultValue = parseFloat(defaultValue);
                break;
            }
            case "bigint": {
                defaultValue = BigInt(defaultValue);
                break;
            }
            case "tinyint": {
                defaultValue = parseInt(defaultValue) === 1;
                break;
            }
            case "date":
            case "datetime": {
                defaultValue = Date.parse(defaultValue);
                break;
            }
        }
    }
    return () => defaultValue;
}

/** @type {import('../../../../myorm/lib/src/index.js').InitializeAdapterCallback<import('mysql2/promise.js').Pool>} */
export function adapter(config) {
    return {
        options: { },
        syntax: {
            escapeColumn: (s) => `\`${s}\``,
            escapeTable: (s) => `\`${s}\``
        },
        execute(scope) {
            return {
                async forQuery(cmd, args) {
                    const [results] = await config.query(cmd, args);
                    return /** @type {any} */ (results);
                },
                async forCount(cmd, args) {
                    const [results] = await config.query(cmd, args);
                    return /** @type {any} */ (results[0].$$count);
                },
                async forInsert(cmd, args) {
                    const [result] = /** @type {import('mysql2/promise').ResultSetHeader[]} */ (await config.execute(cmd, args));
                    return Array.from(Array(result.affectedRows).keys()).map((_, n) => n + result.insertId);
                },
                async forUpdate(cmd, args) {
                    const [result] = /** @type {import('mysql2/promise').ResultSetHeader[]} */ (await config.execute(cmd, args));
                    return result.affectedRows;
                },
                async forDelete(cmd, args) {
                    const [result] = /** @type {import('mysql2/promise').ResultSetHeader[]} */ (await config.execute(cmd, args));
                    return result.affectedRows;
                },
                async forTruncate(cmd, args) {
                    const [result] = /** @type {import('mysql2/promise').ResultSetHeader[]} */ (await config.execute(cmd, args));
                    return result.affectedRows;
                },
                async forDescribe(cmd, args) {
                    const [result] = /** @type {import('mysql2/promise').ResultSetHeader[]} */ (await config.execute(cmd, args));
                    /** @type {any} */
                    let set = {}
                    console.log({result});
                    for(const field in result) {
                        let defaultValue = getDefaultValueFn(result[field].Type, result[field].Default, result[field].Extra);
                        if(result[field].Extra.includes("on update")) {
                            let updateValue = getDefaultValueFn(result[field].Type, result[field].Extra);
                            updateValue = result[field].Extra.replace('on update ', "");
                        }
                        set[field] = {
                            field: result[field].Field,
                            table: "",
                            alias: "",
                            isPrimary: result[field].Key === "PRI",
                            isIdentity: result[field].Extra.includes("auto_increment"),
                            isVirtual: result[field].Extra.includes("VIRTUAL GENERATED"),
                            defaultValue
                        };
                    }
                    console.log({set});
                    return set;
                },
                async forConstraints(cmd, args) {
                    const [results] = /** @type {import('mysql2/promise').RowDataPacket[][]} */ (await config.query(cmd, args));
                    let constraints = [];
                    for(const result of results) {
                        constraints.push({
                            name: result.CONSTRAINT_NAME,
                            table: result.TABLE_NAME,
                            column: result.COLUMN_NAME,
                            refTable: result.REFERENCED_TABLE_NAME,
                            refColumn: result.REFERENCED_COLUMN_NAME
                        });
                    }
                    return constraints;
                }
            }
        },
        serialize(scope) {
            return {
                forQuery(data) {
                    let cmd = '';
                    let args = [];
                    let { where, group_by, order_by, limit, offset, select, from } = data;
                    const [main, ...fromJoins] = from;
                    
                    cmd += `SELECT ${select.map(prop => `${"aggregate" in prop ? "" : prop.table}${"aggregate" in prop ? "" : "."}${prop.column} AS ${prop.alias}`).join('\n\t\t,')}`;
                    
                    const limitStr = limit != undefined ? `LIMIT ${limit}` : '';
                    const offsetStr = limit != undefined && offset != undefined ? `OFFSET ${offset}` : '';
                    cmd += `\n\tFROM ${main.table} AS ${main.alias}`;
                    // if a limit or offset was specified, and an join is expected, then a nested query should take place of the first table.
                    if(limit && from.length > 1) {
                        const whereInfo = handleWhere(where, main.table);
                        cmd += `\n\t\tLEFT JOIN (SELECT * FROM ${main.table} ${whereInfo.cmd} ${limitStr} ${offsetStr}) AS ${from[0].alias}`;
                        args = [...args, ...whereInfo.args];
                    }
                    
                    if(fromJoins.length > 0) {
                        cmd += `\n\t\tLEFT JOIN ` + fromJoins.map(table => `${table.table} AS ${table.alias}\n\t\t\tON ${table.sourceTableKey.table}.${table.sourceTableKey.column} = ${table.targetTableKey.table}.${table.targetTableKey.column}`)
                            .join('\n\t\tLEFT JOIN ');
                    }
                    const whereInfo = handleWhere(where);
                    cmd += `\n\t${whereInfo.cmd}`;
                    args = [...args, ...whereInfo.args];
                    // the inverse happens from above. If a limit or offset was specified but only one table is present, then we will add the strings.
                    if(limit && from.length <= 1) {
                        cmd += limitStr;
                        cmd += offsetStr;
                    }

                    if(group_by) {
                        cmd += '\n\tGROUP BY ' + group_by.map(prop => prop.alias).join('\n\t\t,');
                    }

                    if(order_by) {
                        cmd += '\n\tORDER BY ' + order_by.map(prop => `${prop.alias} ${prop.direction}`).join('\n\t\t,');
                    }

                    return { cmd, args };
                },
                forCount(data) {
                    let cmd = '';
                    let args = [];
                    let { where, group_by, order_by, limit, offset, select, from } = data;
                    const [main, ...fromJoins] = from;
                    
                    cmd += `SELECT COUNT(*) AS $$count`;
                    
                    const limitStr = limit != undefined ? `LIMIT ${limit}` : '';
                    const offsetStr = limit != undefined && offset != undefined ? `OFFSET ${offset}` : '';
                    // if a limit or offset was specified, and an join is expected, then a nested query should occur in place of the first table.
                    if(limit && from.length > 1) {
                        const whereInfo = handleWhere(where, main.table);
                        cmd += `\n\t\tFROM (SELECT * FROM ${main.table} ${whereInfo.cmd} ${limitStr} ${offsetStr}) AS ${main.alias}`;
                        args = [...args, ...whereInfo.args];
                    } else {
                        cmd += `\n\tFROM ${main.table} AS ${main.alias}`;
                    }
                    
                    if(fromJoins.length > 0) {
                        cmd += `\n\t\tLEFT JOIN ` + fromJoins.map(table => `${table.table} AS ${table.alias}\n\t\t\tON ${table.sourceTableKey.table}.${table.sourceTableKey.column} = ${table.targetTableKey.table}.${table.targetTableKey.column}`)
                            .join('\n\t\tLEFT JOIN ');
                    }
                    const whereInfo = handleWhere(where);
                    cmd += `\n\t${whereInfo.cmd}`;
                    args = [...args, ...whereInfo.args];
                    // the inverse happens from above. If a limit or offset was specified but only one table is present, then we will add the strings.
                    if(limit && from.length <= 1) {
                        cmd += limitStr;
                        cmd += offsetStr;
                    }

                    if(group_by) {
                        cmd += '\n\tGROUP BY ' + group_by.map(prop => prop.alias).join('\n\t\t,');
                    }

                    if(order_by) {
                        cmd += '\n\tORDER BY ' + order_by.map(prop => prop.alias).join('\n\t\t,');
                    }

                    return { cmd, args };
                },
                forInsert(data) {
                    let cmd = "";
                    let args = [];
                    const { table, columns, values } = data;
                    args = values.flat();
                    cmd += `INSERT INTO ${table} (${columns.join(', ')})\n\tVALUES\n\t\t${values.flatMap(v => `(${Array.from(Array(v.length).keys()).map(_ => '?')})`).join('\n\t\t,')}`;
                    return { cmd: cmd, args: args };
                },
                forUpdate(data) {
                    let cmd = "";
                    let args = [];
                    const { table, columns, where, explicit, implicit } = data;
                    if(implicit) { 
                        const { primaryKeys, objects } = implicit;
                        let cases = columns.reduce((accumulator, value) => {
                            return { ...accumulator, [value]: { cmd: 'CASE\n\t\t', args: [] }};
                        }, {});
                        for (const record of objects) {
                            // Otherwise, add to the CASE clause.
                            for (const key in record) {
                                for(const primaryKey of primaryKeys) {
                                    if(key === primaryKey) continue;
                                    cases[key].cmd += `\tWHEN ${primaryKey} = ? THEN ?\n\t\t`;
                                    cases[key].args = [...cases[key].args, record[primaryKey], record[key]];
                                }
                            }
                        }
                        Object.keys(cases).forEach(k => cases[k].cmd += `\tELSE \`${k}\`\n\t\tEND`);

                        // Delete the cases that have no sets.
                        for (const key in cases) {
                            if (cases[key].args.length <= 0) {
                                delete cases[key];
                            }
                        }
                        const { cmd: cmdWhere, args: cmdArgs } = handleWhere(where);
                        args = [...Object.keys(cases).flatMap(k => cases[k].args), ...cmdArgs];
                        cmd = `UPDATE ${table}\n\tSET\n\t\t${Object.keys(cases).map(k => `\`${k}\` = (${cases[k].cmd})`).join(',\n\t\t')} ${cmdWhere}`;
                    }
                    if(explicit) {
                        const { values } = explicit;
                        
                        const { cmd: cmdWhere, args: cmdArgs } = handleWhere(where);
                        args = values.concat(cmdArgs);
                        cmd = `UPDATE ${table}\n\tSET\n\t\t${values.map((v,n) => `${columns[n]} = ?`).join('\n\t\t,')} ${cmdWhere}`;
                    }
                    return { cmd, args };
                },
                forDelete(data) {
                    const { table, where } = data;
                    const { cmd, args } = handleWhere(where);
                    return { cmd: `DELETE FROM ${table} ${cmd}`, args };
                },
                forTruncate(data) {
                    return { cmd: `TRUNCATE ${data.table}`, args: [] };
                },
                forDescribe(table) {
                    return { cmd: `DESCRIBE ${table};`, args: [] };
                },
                forConstraints(table) {
                    return {
                        cmd: `SELECT TABLE_NAME, COLUMN_NAME, CONSTRAINT_NAME, REFERENCED_TABLE_NAME, REFERENCED_COLUMN_NAME FROM INFORMATION_SCHEMA.KEY_COLUMN_USAGE WHERE TABLE_NAME = ? AND REFERENCED_TABLE_NAME IS NOT NULL`,
                        args: [table]
                    };
                }
            }
        }
    }
}

export const createMySql2Pool = createPool;
