const appRoot = require('app-root-path');
const config = require(appRoot + '/config/config.js');
const express = require('express');
const router = express.Router();
const fs = require('fs');
const Database = require('better-sqlite3');
const jsondata = require(appRoot + '/modules/jsondata.js');
const _ = require('lodash');
const MarkdownIt = require('markdown-it'),
    md = new MarkdownIt();

let databasePath = appRoot + '/config/' + config.sqlite_file_name;

if (!fs.existsSync(databasePath)) {
  databasePath = appRoot + '/config/database.sqlite.sample';
}

const db = new Database(databasePath);

let punksTable = collectionName+"_"+"punks";
let trait_typesTable = collectionName+"_"+"trait_types";
let trait_detail_typesTable = collectionName+"_"+"trait_detail_types";
let punk_trait_countsTable = collectionName+"_"+"punk_trait_counts";
let punk_traitsTable = collectionName+"_"+"punk_traits";
/* GET punks listing. */
router.get('/:collectionName:id', function(req, res, next) {
  let collectionName = req.params.collectionName;
  let punkId = req.params.id;
  let useTraitNormalization = req.query.trait_normalization;

  let scoreTable = collectionName+"_"+'punk_scores';
  if (useTraitNormalization == '1') {
    useTraitNormalization = '1';
    scoreTable = collectionName+"_"+'normalized_punk_scores';
  } else {
    useTraitNormalization = '0';
  }

  let punk = db.prepare('SELECT '+punksTable+'.*, '+scoreTable+'.rarity_rank FROM '+punksTable+' INNER JOIN '+scoreTable+' ON ('+punksTable+'.id = '+scoreTable+'.punk_id) WHERE '+punksTable+'.id = ?').get(punkId);
  let punkScore = db.prepare('SELECT '+scoreTable+'.* FROM '+scoreTable+' WHERE '+scoreTable+'.punk_id = ?').get(punkId);
  let allTraitTypes = db.prepare('SELECT '+trait_typesTable+'.* FROM '+trait_typesTable).all();
  let allDetailTraitTypes = db.prepare('SELECT '+trait_detail_typesTable+'.* FROM '+trait_detail_typesTable).all();
  let allTraitCountTypes = db.prepare('SELECT '+punk_trait_countsTable+'.* FROM '+punk_trait_countsTable).all();

  let punkTraits = db.prepare('SELECT '+punk_traitsTable+'.*, '+trait_typesTable+'.trait_type  FROM '+punk_traitsTable+' INNER JOIN '+trait_typesTable+' ON ('+punk_traitsTable+'.trait_type_id = '+trait_typesTable+'.id) WHERE '+punk_traitsTable+'.punk_id = ?').all(punkId);
  let totalPunkCount = db.prepare('SELECT COUNT(id) as punk_total FROM '+punksTable+'').get().punk_total;

  let punkTraitData = {};
  let ignoredPunkTraitData = {};
  let ignoreTraits = config.ignore_traits.map(ignore_trait => ignore_trait.toLowerCase());
  punkTraits.forEach(punkTrait => {
    punkTraitData[punkTrait.trait_type_id] = punkTrait.value;

    if (!ignoreTraits.includes(punkTrait.trait_type.toLowerCase())) {
      ignoredPunkTraitData[punkTrait.trait_type_id] = punkTrait.value;
    }
  });

  let allDetailTraitTypesData = {};
  allDetailTraitTypes.forEach(detailTrait => {
    allDetailTraitTypesData[detailTrait.trait_type_id+'|||'+detailTrait.trait_detail_type] = detailTrait.punk_count;
  });

  let allTraitCountTypesData = {};
  allTraitCountTypes.forEach(traitCount => {
    allTraitCountTypesData[traitCount.trait_count] = traitCount.punk_count;
  });

  let title = config.collection_name + ' | ' + config.app_name;
  //let description = config.collection_description + ' | ' + config.app_description
  let description = punk ? `💎 ID: ${ punk.id }
    💎 Rarity Rank: ${ punk.rarity_rank }
    💎 Rarity Score: ${ punkScore.rarity_sum.toFixed(2) }` : '';

  if (!_.isEmpty(punk)) {
    title = punk.name + ' | ' + config.app_name;
  }
  
  res.render('punk', {
    appTitle: title,
    appDescription: description,
    ogTitle: title,
    ogDescription: description,
    ogUrl: req.protocol + '://' + req.get('host') + req.originalUrl,
    ogImage: punk ? punk.image.replace('ipfs://', 'https://ipfs.io/ipfs/'): config.main_og_image,
    activeTab: 'rarity',
    punk: punk, 
    punkScore: punkScore, 
    allTraitTypes: allTraitTypes, 
    allDetailTraitTypesData: allDetailTraitTypesData, 
    allTraitCountTypesData: allTraitCountTypesData, 
    punkTraitData: punkTraitData, 
    ignoredPunkTraitData: ignoredPunkTraitData,
    totalPunkCount: totalPunkCount, 
    trait_normalization: useTraitNormalization,
    _: _,
    md: md
  });
});

router.get('/:id/json', function(req, res, next) {
  let punkId = req.params.id;
  let useTraitNormalization = req.query.trait_normalization;

  let scoreTable = collectionName+"_"+'punk_scores';
  if (useTraitNormalization == '1') {
    useTraitNormalization = '1';
    scoreTable = collectionName+"_"+'normalized_punk_scores';
  } else {
    useTraitNormalization = '0';
  }

  let punk = db.prepare('SELECT '+punksTable+'.*, '+scoreTable+'.rarity_rank FROM '+punksTable+' INNER JOIN '+scoreTable+' ON ('+punksTable+'.id = '+scoreTable+'.punk_id) WHERE '+punksTable+'.id = ?').get(punkId);
  
  if (_.isEmpty(punk)) {
    res.end(JSON.stringify({
      status: 'fail',
      message: 'not_exist',
    }));
  }

  let punkData = jsondata.punk(punk, scoreTable);
  
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify({
    status: 'success',
    message: 'success',
    punk: punkData
  }));
});

router.get('/:id/similar', function(req, res, next) {
  let punkId = req.params.id;
  let useTraitNormalization = req.query.trait_normalization;

  let scoreTable = collectionName+"_"+'punk_scores';
  if (useTraitNormalization == '1') {
    useTraitNormalization = '1';
    scoreTable = collectionName+"_"+'normalized_punk_scores';
  } else {
    useTraitNormalization = '0';
  }

  let punk = db.prepare('SELECT '+punksTable+'.*, '+scoreTable+'.rarity_rank FROM '+punksTable+' INNER JOIN '+scoreTable+' ON ('+punksTable+'.id = '+scoreTable+'.punk_id) WHERE '+punksTable+'.id = ?').get(punkId);
  let punkScore = db.prepare('SELECT '+scoreTable+'.* FROM '+scoreTable+' WHERE '+scoreTable+'.punk_id = ?').get(punkId);
  let allTraitTypes = db.prepare('SELECT '+trait_typesTable+'.* FROM '+trait_typesTable).all();
  let similarCondition = '';
  let similarTo = {};
  let similarPunks = null;
  if (punkScore) {
    allTraitTypes.forEach(traitType => {
      similarCondition = similarCondition + 'IIF('+scoreTable+'.trait_type_'+traitType.id+'_value = :trait_type_'+traitType.id+', 1 * '+scoreTable+'.trait_type_'+traitType.id+'_rarity, 0) + ';
      similarTo['trait_type_'+traitType.id] = punkScore['trait_type_'+traitType.id+'_value'];
    });
    similarTo['trait_count'] = punkScore['trait_count'];
    similarTo['this_punk_id'] = punkId;
    similarPunks = db.prepare(`
      SELECT
      `+punksTable+`.*,
        `+scoreTable+`.punk_id, 
        (
          ` 
          + similarCondition +
          `
          IIF(`+scoreTable+`.trait_count = :trait_count, 1 * 0, 0)
        )
        similar 
      FROM `+scoreTable+`  
      INNER JOIN `+punksTable+` ON (`+scoreTable+`.punk_id = `+punksTable+`.id)
      WHERE `+scoreTable+`.punk_id != :this_punk_id
      ORDER BY similar desc
      LIMIT 12
      `).all(similarTo);
  }

  
  let title = config.collection_name + ' | ' + config.app_name;
  let description = config.collection_description + ' | ' + config.app_description
  if (!_.isEmpty(punk)) {
    title = punk.name + ' | ' + config.app_name;
  }

  res.render('similar_punks', { 
    appTitle: title,
    appDescription: description,
    ogTitle: title,
    ogDescription: description,
    ogUrl: req.protocol + '://' + req.get('host') + req.originalUrl,
    ogImage: punk ? punk.image.replace('ipfs://', 'https://ipfs.io/ipfs/'): config.main_og_image,
    activeTab: 'rarity',
    punk: punk,
    similarPunks: similarPunks,
    trait_normalization: useTraitNormalization,
    _: _
  });
});

module.exports = router;
