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
router.get('/:name', function(req, res, next) {

  let collectionName = req.params.name;
  let punksTable = collectionName+"_"+"punks";
  let trait_typesTable = collectionName+"_"+"trait_types";
  let trait_detail_typesTable = collectionName+"_"+"trait_detail_types";
  let punk_trait_countsTable = collectionName+"_"+"punk_trait_counts";
  let scoreTable = collectionName+"_"+'punk_scores';

  let search = req.query.search;
  let traits = req.query.traits;
  let useTraitNormalization = req.query.trait_normalization;
  let orderBy = req.query.order_by;
  let page = req.query.page;

  let offset = 0;
  let limit = config.page_item_num;

  if (_.isEmpty(search)) {
    search = '';
  }

  if (_.isEmpty(traits)) {
    traits = '';
  }

  
  if (useTraitNormalization == '1') {
    useTraitNormalization = '1';
    scoreTable = collectionName+"_"+'normalized_punk_scores';
  } else {
    useTraitNormalization = '0';
  }

  if (orderBy == 'rarity' || orderBy == 'id') {
    orderBy = orderBy;
  } else {
    orderBy = 'rarity';
  }

  if (!_.isEmpty(page)) {
    page = parseInt(page);
    if (!isNaN(page)) {
      offset = (Math.abs(page) - 1) * limit;
    } else {
      page = 1;
    }
  } else {
    page = 1;
  }

  let selectedTraits = (traits != '') ? traits.split(',') : [];
  let totalPunkCount = 0
  let punks = null;
  let orderByStmt = '';
  if (orderBy == 'rarity') {
    orderByStmt = 'ORDER BY '+scoreTable+'.rarity_rank ASC';
  } else {
    orderByStmt = 'ORDER BY '+punksTable+'.id ASC';
  }

  let totalSupply = db.prepare('SELECT COUNT('+punksTable+'.id) as punk_total FROM '+punksTable).get().punk_total;
  let allTraitTypes = db.prepare('SELECT '+trait_typesTable+'.* FROM '+trait_typesTable).all();
  let allTraitTypesData = {};
  allTraitTypes.forEach(traitType => {
    allTraitTypesData[traitType.trait_type] = traitType.punk_count;
  });

  let allTraits = db.prepare('SELECT '+trait_typesTable+'.trait_type, '+trait_detail_typesTable+'.trait_detail_type, '+trait_typesTable+'.punk_count, '+trait_detail_typesTable+'.trait_type_id, '+trait_detail_typesTable+'.id trait_detail_type_id  FROM '+trait_detail_typesTable+' INNER JOIN '+trait_typesTable+' ON ('+trait_detail_typesTable+'.trait_type_id = '+trait_typesTable+'.id) WHERE '+trait_detail_typesTable+'.punk_count != 0 ORDER BY '+trait_typesTable+'.trait_type, '+trait_detail_typesTable+'.trait_detail_type').all();
  let totalPunkCountQuery = 'SELECT COUNT('+punksTable+'.id) as punk_total FROM '+punksTable+' INNER JOIN '+scoreTable+' ON ('+punksTable+'.id = '+scoreTable+'.punk_id) ';
  let punksQuery = 'SELECT '+punksTable+'.*, '+scoreTable+'.rarity_rank FROM '+punksTable+' INNER JOIN '+scoreTable+' ON ('+punksTable+'.id = '+scoreTable+'.punk_id) ';
  let totalPunkCountQueryValue = {};
  let punksQueryValue = {};

  if (!_.isEmpty(search)) {
    search = parseInt(search);
    totalPunkCountQuery = totalPunkCountQuery+' WHERE '+punksTable+'.id LIKE :punk_id ';
    totalPunkCountQueryValue['punk_id'] = '%'+search+'%';

    punksQuery = punksQuery+' WHERE '+punksTable+'.id LIKE :punk_id ';
    punksQueryValue['punk_id'] = '%'+search+'%';
  } else {
    totalPunkCount = totalPunkCount;
  }

  let allTraitTypeIds = [];
  allTraits.forEach(trait => {
    if (!allTraitTypeIds.includes(trait.trait_type_id.toString())) {
      allTraitTypeIds.push(trait.trait_type_id.toString());
    }
  }); 

  let purifySelectedTraits = [];
  if (selectedTraits.length > 0) {

    selectedTraits.map(selectedTrait => {
      selectedTrait = selectedTrait.split('_');
      if ( allTraitTypeIds.includes(selectedTrait[0]) ) {
        purifySelectedTraits.push(selectedTrait[0]+'_'+selectedTrait[1]);
      }
    });

    if (purifySelectedTraits.length > 0) {
      if (!_.isEmpty(search.toString())) {
        totalPunkCountQuery = totalPunkCountQuery + ' AND ';
        punksQuery = punksQuery + ' AND ';
      } else {
        totalPunkCountQuery = totalPunkCountQuery + ' WHERE ';
        punksQuery = punksQuery + ' WHERE ';
      }
      let count = 0;

      purifySelectedTraits.forEach(selectedTrait => {
        selectedTrait = selectedTrait.split('_');
        totalPunkCountQuery = totalPunkCountQuery+' '+scoreTable+'.trait_type_'+selectedTrait[0]+'_value = :trait_type_'+selectedTrait[0]+'_value ';
        punksQuery = punksQuery+' '+scoreTable+'.trait_type_'+selectedTrait[0]+'_value = :trait_type_'+selectedTrait[0]+'_value ';
        if (count != (purifySelectedTraits.length-1)) {
          totalPunkCountQuery = totalPunkCountQuery + ' AND ';
          punksQuery = punksQuery + ' AND ';
        }
        count++;

        totalPunkCountQueryValue['trait_type_'+selectedTrait[0]+'_value'] = selectedTrait[1];
        punksQueryValue['trait_type_'+selectedTrait[0]+'_value'] = selectedTrait[1];    
      });
    }
  }
  let purifyTraits = purifySelectedTraits.join(',');

  punksQuery = punksQuery+' '+orderByStmt+' LIMIT :offset,:limit';
  punksQueryValue['offset'] = offset;
  punksQueryValue['limit'] = limit;

  totalPunkCount = db.prepare(totalPunkCountQuery).get(totalPunkCountQueryValue).punk_total;
  punks = db.prepare(punksQuery).all(punksQueryValue);

  let totalPage =  Math.ceil(totalPunkCount/limit);

  res.render('index', {
    appTitle: config.app_name,
    appDescription: config.app_description,
    ogTitle: config.collection_name + ' | ' + config.app_name,
    ogDescription: config.collection_description + ' | ' + config.app_description,
    ogUrl: req.protocol + '://' + req.get('host') + req.originalUrl,
    ogImage: config.main_og_image,
    activeTab: 'rarity',
    collectionName: collectionName,
    punks: punks, 
    totalPunkCount: totalPunkCount,
    totalPage: totalPage, 
    search: search, 
    useTraitNormalization: useTraitNormalization,
    orderBy: orderBy,
    traits: purifyTraits,
    selectedTraits: purifySelectedTraits,
    allTraits: allTraits,
    page: page,
    totalSupply: totalSupply,
    allTraitTypesData: allTraitTypesData,
    _:_ 
  });
});


router.get('/:name/traits', function(req, res, next) {
  let collectionName = req.params.name;
  let punksTable = collectionName+"_"+"punks";
  let trait_typesTable = collectionName+"_"+"trait_types";
  let trait_detail_typesTable = collectionName+"_"+"trait_detail_types";
  let punk_trait_countsTable = collectionName+"_"+"punk_trait_counts";
  let scoreTable = collectionName+"_"+'punk_scores';

  let allTraits = db.prepare('SELECT '+trait_typesTable+'.trait_type, '+trait_detail_typesTable+'.trait_detail_type, '+trait_detail_typesTable+'.punk_count FROM '+trait_detail_typesTable+' INNER JOIN '+trait_typesTable+' ON ('+trait_detail_typesTable+'.trait_type_id = '+trait_typesTable+'.id) WHERE '+trait_detail_typesTable+'.punk_count != 0 ORDER BY '+trait_typesTable+'.trait_type, '+trait_detail_typesTable+'.trait_detail_type').all();
  let allTraitCounts = db.prepare('SELECT * FROM '+punk_trait_countsTable+' WHERE punk_count != 0 ORDER BY trait_count').all();
  let totalPunkCount = db.prepare('SELECT COUNT(id) as punk_total FROM '+punksTable+'').get().punk_total;

  res.render('traits', {
    appTitle: config.app_name,
    appDescription: config.app_description,
    ogTitle: config.collection_name + ' | ' + config.app_name,
    ogDescription: config.collection_description + ' | ' + config.app_description,
    ogUrl: req.protocol + '://' + req.get('host') + req.originalUrl,
    ogImage: config.main_og_image,
    activeTab: 'traits',
    allTraits: allTraits,
    allTraitCounts: allTraitCounts,
    totalPunkCount: totalPunkCount,
    _:_ 
  });
});

router.get('/:name/wallet', function(req, res, next) {
  let collectionName = req.params.name;
  let punksTable = collectionName+"_"+"punks";
  let trait_typesTable = collectionName+"_"+"trait_types";
  let trait_detail_typesTable = collectionName+"_"+"trait_detail_types";
  let punk_trait_countsTable = collectionName+"_"+"punk_trait_counts";
  let scoreTable = collectionName+"_"+'punk_scores';

  let search = req.query.search;
  let useTraitNormalization = req.query.trait_normalization;

  if (_.isEmpty(search)) {
    search = '';
  }

  if (useTraitNormalization == '1') {
    useTraitNormalization = '1';
    scoreTable = collectionName + 'normalized_punk_scores';
  } else {
    useTraitNormalization = '0';
  }

  let isAddress = Web3.utils.isAddress(search);
  let tokenIds = [];
  let punks = null;
  if (isAddress) {
    let url = 'https://api.punkscape.xyz/address/'+search+'/punkscapes';
    let result = request('GET', url);
    let data = result.getBody('utf8');
    data = JSON.parse(data);
    data.forEach(element => {
      tokenIds.push(element.token_id);
    });
    if (tokenIds.length > 0) {
      let punksQuery = 'SELECT '+punksTable+'.*, '+scoreTable+'.rarity_rank FROM '+punksTable+' INNER JOIN '+scoreTable+' ON ('+punksTable+'.id = '+scoreTable+'.punk_id) WHERE '+punksTable+'.id IN ('+tokenIds.join(',')+') ORDER BY '+scoreTable+'.rarity_rank ASC';
      punks = db.prepare(punksQuery).all();
    }
  }

  res.render('wallet', {
    appTitle: config.app_name,
    appDescription: config.app_description,
    ogTitle: config.collection_name + ' | ' + config.app_name,
    ogDescription: config.collection_description + ' | ' + config.app_description,
    ogUrl: req.protocol + '://' + req.get('host') + req.originalUrl,
    ogImage: config.main_og_image,
    activeTab: 'wallet',
    punks: punks,
    search: search, 
    useTraitNormalization: useTraitNormalization,
    _:_ 
  });
});

module.exports = router;
