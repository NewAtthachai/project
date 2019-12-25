var fs = require('fs')
var csv = require('csvtojson')
var sortBy = require('array-sort-by')
var d = new Date()
var MongoClient = require('mongodb').MongoClient
var assert = require('assert');
var url = 'mongodb://localhost:27017/'
var dbName = 'stock'
var ObjectID = require('mongodb').ObjectID;
const path = require('path');
const util = require('util');
const readDir = util.promisify(fs.readdir);
const directoryPath = path.join(__dirname, 'stock');

module.exports = {
    read: function () {
        getDir().then(result => {
            var last = result.length - 1
            var fileCsv = __dirname + '/stock/' + result[last] // EDIT PATH CSV FILE
            console.log(fileCsv)
            readFunction(fileCsv).then(result => {
                var obj = {
                    excelData: [],
                }
                obj.excelData = result
                getDbStock(obj).then(result => {
                    mergeArr(result)
                }).catch(error => {
                    console.log(error)
                })
            }).catch(error => {
                console.log(error)
            })
        }).catch(error => {
            console.log(error)
        })
    },
};

async function getDir() {
    const dirFile = await readDir(directoryPath);
    return dirFile
}

async function readFunction(fileCsv) {
    var fileName = fileCsv
    csv()
        .fromFile(fileName)
        .then((jsonObj) => {
            var result = sortBy(jsonObj, item => item.Materialno);
            var i = result.length
            while (i--) {
                var values = Object.values(result[i])
                var valuesLength = values.length
                for (var f = 0; f < valuesLength; f++) {
                    if (values[f] == '') {
                        result.splice(i, 1)
                        f = valuesLength
                    }
                }
            }
        })
    const readResult = await csv().fromFile(fileName);
    return readResult
}

async function getDbStock(obj) {
    var obj = obj
    const client = await MongoClient.connect(url, { useNewUrlParser: true })
        .catch(err => { console.log(err); });
    if (!client) {
        return;
    }
    try {
        const db = client.db('stock');
        let collection = db.collection('stock');
        let res = await collection.find({}).toArray()
        obj.dbData = res
        return obj
    } catch (err) {
        console.log(err);
    } finally {
        client.close();
    }
}

function mergeArr(obj) {
    var obj = obj
    var dbDataLength = obj.dbData.length
    var excelData = obj.excelData
    var excelData = obj.excelData
    var dbData = obj.dbData
    for (var i = 0; i < dbData.length; i++) {
        for (var d = 0; d < dbData[i].plant.length; d++) {
            dbData[i].plant[d].unrestrictuse = 0
            dbData[i].plant[d].reserve = 0
        }
    }
    for (var i = 0; i < excelData.length; i++) {
        for (var v = 0; v < dbData.length; v++) {
            if (excelData[i].Materialno == dbData[v].materialno) {
                for (var p = 0; p < dbData[v].plant.length; p++) {
                    if (excelData[i].Plant == dbData[v].plant[p].plantnumber
                        && excelData[i].SLoc == dbData[v].plant[p].sloc
                        && excelData[i].SlocDesc == dbData[v].plant[p].slocdesc) {
                        dbData[v].plant[p].unrestrictuse = parseInt(excelData[i].Unrestrictuse)
                        dbData[v].plant[p].reserve = parseInt(excelData[i].Reserve)
                        dbData[v].plant[p].exporttime = excelData[i].Exporttime
                        excelData[i].Materialno = 'delete'
                    }
                }
                if (excelData[i].Materialno != 'delete') {
                    var objPart = {
                        plantnumber: excelData[i].Plant,
                        sloc: excelData[i].SLoc,
                        slocdesc: excelData[i].SlocDesc,
                        unrestrictuse: parseInt(excelData[i].Unrestrictuse),
                        reserve: parseInt(excelData[i].Reserve),
                        exporttime: excelData[i].Exporttime,
                    }
                    var materialPlant = dbData[v].plant
                    materialPlant.push(objPart)
                    excelData[i].Materialno = 'delete'
                }
                v = dbData.length
            }
        }
    }
    var i = excelData.length
    while (i--) {
        if (excelData[i].Materialno == 'delete') {
            excelData.splice(i, 1)
        }
    }
    if (excelData.length != 0) {
        addDb(excelData)
    }
    var update = obj.dbData
    updateDb(update)
}

function updateDb(update) {
    var update = update
    console.log(update)
    for (var i = 0; i < update.length; i++) {
        console.log(update[i])
        update[i].totalunrestrictuse = 0
        update[i].totalreserve = 0
        for (var v = 0; v < update[i].plant.length; v++) {
            if (update[i].plant[v].slocdesc == 'Installation') {
                update[i].totalunrestrictuse += update[i].plant[v].unrestrictuse
            }
            update[i].totalreserve += update[i].plant[v].reserve
        }
        update[i].totaltouse = update[i].totalunrestrictuse - update[i].totalreserve
        if (update[i].totaltouse >= update[i].max) {
            update[i].color = 'green'
        } else if (update[i].totaltouse > update[i].min) {
            update[i].color = 'yellow'
        } else {
            update[i].color = 'red'
        }
    }
    MongoClient.connect(url, function (err, client) {
        if (err) throw err;
        const db = client.db(dbName);
        for (var i = 0; i < update.length; i++) {
            var materialno = update[i].materialno
            var myquery = { materialno: materialno };
            var newvalues = {
                $set: {
                    color: update[i].color,
                    totaltouse: update[i].totaltouse,
                    totalunrestrictuse: update[i].totalunrestrictuse,
                    totalreserve: update[i].totalreserve,
                    datemodified: d.toDateString(),
                    plant: update[i].plant,
                }
            };
            update[i].materialno
            db.collection('stock').updateOne(myquery, newvalues, function (err, result) {
                if (err) throw err;
                console.log('complete')
            });
        }
        client.close()
    });
}

function addDb(excelData) {
    console.log('Add to DB.')
    var excelData = excelData
    var arrData = []
    var obj = {
        materialno: excelData[0].Materialno,
        color: 'grey',
        min: 0,
        max: 0,
        totaltouse: 0,
        totalunrestrictuse: 0,
        totalreserve: 0,
        datemodified: d.toDateString(),
        plant: [{
            plantnumber: excelData[0].Plant,
            sloc: excelData[0].SLoc,
            slocdesc: excelData[0].SlocDesc,
            unrestrictuse: parseInt(excelData[0].Unrestrictuse),
            reserve: parseInt(excelData[0].Reserve),
            exporttime: excelData[0].Exporttime,
        }]
    }
    arrData.push(obj)
    var v = 0
    for (var i = 1; i < excelData.length; i++) {
        var arrLength = arrData.length
        for (v; v < arrLength; v++) {
            if (excelData[i].Materialno == arrData[v].materialno) {
                var pushItem = {
                    plantnumber: excelData[i].Plant,
                    sloc: excelData[i].SLoc,
                    slocdesc: excelData[i].SlocDesc,
                    unrestrictuse: parseInt(excelData[i].Unrestrictuse),
                    reserve: parseInt(excelData[i].Reserve),
                    exporttime: excelData[i].Exporttime,
                }
                var plantArrData = arrData[v].plant
                plantArrData.push(pushItem)
                v = arrLength
            } else {
                var obj = {
                    materialno: excelData[i].Materialno,
                    color: 'grey',
                    min: 0,
                    max: 0,
                    totaltouse: 0,
                    totalunrestrictuse: 0,
                    totalreserve: 0,
                    datemodified: d.toDateString(),
                    plant: [{
                        plantnumber: excelData[i].Plant,
                        sloc: excelData[i].SLoc,
                        slocdesc: excelData[i].SlocDesc,
                        unrestrictuse: parseInt(excelData[i].Unrestrictuse),
                        reserve: parseInt(excelData[i].Reserve),
                        exporttime: excelData[i].Exporttime,
                    }]
                }
                arrData.push(obj)
                v = arrLength
            }
        }
        v -= 1
    }
    MongoClient.connect(url, function (err, client) {
        if (err) throw err;
        const db = client.db(dbName);
        db.collection('stock').insertMany(arrData, function (err, res) {
            if (err) throw err;
            client.close()
        });
    });
}