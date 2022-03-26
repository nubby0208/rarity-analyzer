const appRoot = require('app-root-path');
const config = require(appRoot + '/config/config.js');
const request = require('sync-request');
const express = require('express');
const router = express.Router();
const Web3 = require('web3');
const fs = require('fs');
const Database = require('better-sqlite3');
const _ = require('lodash');

let databasePath = appRoot + '/config/' + config.sqlite_file_name;

if (!fs.existsSync(databasePath)) {
  databasePath = appRoot + '/config/database.sqlite.sample';
}

const db = new Database(databasePath);

/* GET home page. */
router.get('/', function(req, res, next) {

  let totalCollectionCount = db.prepare('SELECT COUNT(collections.id) as collection_total FROM collections').get().collection_total;

  let collectionsQuery = 'SELECT collections.* FROM collections';
  
  collections = db.prepare(collectionsQuery).all();
  let totalPage =  Math.ceil(totalCollectionCount/limit);

  res.render('index', {
    appTitle: config.app_name,
    appDescription: config.app_description,
    ogTitle: config.collection_name + ' | ' + config.app_name,
    ogDescription: config.collection_description + ' | ' + config.app_description,
    ogUrl: req.protocol + '://' + req.get('host') + req.originalUrl,
    ogImage: config.main_og_image,
    activeTab: 'rarity',
    collections: collections, 
    totalCollectionCount: totalCollectionCount,
    totalPage: totalPage, 
    search: search,
    orderBy: orderBy,
    page: page,
    _:_ 
  });
});

module.exports = router;
