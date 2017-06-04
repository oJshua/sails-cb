'use strict';
/**
 * Module that handle all the related tasks with N1Ql like building the queries.
 *
 * @module n1ql
 * @main n1ql
 */
//*******************************************
//Dependencies
//*******************************************
var _ = require('lodash');
var N1qlQuery = require('couchbase').N1qlQuery;
var moment = require('moment');
//*******************************************
// Constructor & Properties
//*******************************************

/**
 * Object Constructor.
 *
 * @class n1ql
 * 
 * @constructor
 */
var n1ql = function () {};

//*******************************************
//Methods
//*******************************************

/**
 * Make the instantiation of a new N1QL Query.
 *
 * @method query
 *
 * @param  {String} query       The Query to execute
 * @param  {number} consistency The consistency level to use with the execution of the query.
 *                              **1**: NOT_BOUNDED: This is the default (for single-statement requests).
 **2**: REQUEST_PLUS: This implements strong consistency per request.
 **3**: STATEMENT_PLUS: This implements strong consistency per statement.
 *
 * @return {N1QL Query}             The Query instance to pass to the couchbase bucket for execution.
 */
n1ql.prototype.query = function (query, consistency) {
  return N1qlQuery.fromString(query).consistency(consistency || 1);
};

/**
 * Builds the `SELECT` sentence for the query from the options passed in to the adapter function.
 *
 * @method buildSelect
 *
 * @param  {String}    collection The Name of the Collection of Document Type name.
 * @param  {ColDef}    colDef     A Dictionary Object with the waterline internal definition of the schema of the model represented by the collection.
 * @param  {String}    bucket     The name of the Bucket holding the Collection or Document Type.
 * @param  {Object}    options    A dictionary Object with the waterline options for the operation.
 *
 * @return {String}               The N1QL query to execute.
 */
n1ql.prototype.buildSelect = function (collection, colDef, bucket, options) {
  var self = this;
  var query = 'SELECT ';
  var fields = [];

  if (options.groupBy && _.keys(_.pick(options, 'array_agg', 'average', 'count', 'max', 'min', 'sum')).length === 0){
    return {error:'You have to use an aggregate function if using groupBy clause'};
  }

  // Add the ID or Primary Key to the result of the query.
  if (options.select){
    fields = options.select;
    fields.push('META(' + self.scape(collection) + ').id');
  } else {
    fields = ['*', 'META(' + self.scape(collection) + ').id'];
  }

  //Aggregate Functions:

  if (options.array_agg){
    _.each(options.array_agg, function(array_agg) {
      fields.push('array_agg(' + array_agg + ') ' + array_agg);
    });
  }
  if (options.average){
    _.each(options.average, function(avg) {
      fields.push('avg(' + avg + ') ' + avg);
    });
  }
  if (options.count){
    _.each(options.count, function(count) {
      fields.push('count(' + count + ') ' + count);
    });
  }
  if (options.max){
    _.each(options.max, function(max) {
      fields.push('max(' + max + ') ' + max);
    });
  }
  if (options.min){
    _.each(options.min, function(min) {
      fields.push('min(' + min + ') ' + min);
    });
  }
  if (options.sum){
    _.each(options.sum, function(sum) {
      fields.push('sum(' + sum + ') ' + sum);
    });
  }

  query += fields.join(', ');
  query += ' FROM ' + bucket + ' ' + self.scape(collection);
  
  // Build The where Clause.
  query += this.where(options.where, collection, bucket, colDef, options);
  
  // Group By
  if (options && options.groupBy) {
    query += ' GROUP BY ';
    // Normalize to array
    if (!Array.isArray(options.groupBy)) {
      options.groupBy = [options.groupBy];
    }
    options.groupBy = _.map(options.groupBy, function(g) {
      return self.scape(g);
    });
    query += options.groupBy.join(', ') + ' ';
  }
  
  ///////////////////////////////////////////////////
  // Added to pass the waterline integration tests //
  ///////////////////////////////////////////////////
  if (options.testMode && !options.sort){
    query += ' ORDER BY META('+ self.scape(collection) +').id ASC';
  }

  // Sort
  if (options && options.sort) {
    query += ' ORDER BY ';
    // Sort through each sort attribute criteria
    _.each(options.sort, function (direction, attrName) {
      if (colDef.primaryKey === attrName){
        query += 'META('+ self.scape(collection) +').id ';  
      } else {
        query += self.scape(collection) + '.' + self.scape(attrName) + ' ';
      }

      // Basic MongoDB-style numeric sort direction
      if (direction === 1) {
        query += 'ASC, ';
      } else {
        query += 'DESC, ';
      }
    });

    // Remove trailing comma
    if (query.slice(-2) === ', ') {
      query = query.slice(0, -2) + ' ';
    }
  }

  // Limit
  if (_.has(options, 'limit') && (options.limit !== null && options.limit !== undefined)) {
    query += ' LIMIT ' + options.limit + ' ';
  }

  // Skip
  if (_.has(options, 'skip') && (options.skip !== null && options.skip !== undefined)) {
    query += ' OFFSET ' + options.skip + ' ';
  }
  return query;
};

/**
 * Builds the `DELETE` sentence for the query from the options passed in to the adapter function.
 *
 * @method buildSelect
 *
 * @param  {String}    collection The Name of the Collection of Document Type name.
 * @param  {ColDef}    colDef     A Dictionary Object with the waterline internal definition of the schema of the model represented by the collection.
 * @param  {String}    bucket     The name of the Bucket holding the Collection or Document Type.
 * @param  {Object}    options    A dictionary Object with the waterline options for the operation.
 *
 * @return {String}               The N1QL query to execute.
 */
n1ql.prototype.buildDelete = function (collection, colDef, bucket, options) {
  var query = 'DELETE FROM ' + bucket + ' ' + collection + this.where(options.where, collection, bucket, colDef, options);
  if (!options.doNotReturn){
    query += ' RETURNING ' + this.scape(collection) + ', META(' + this.scape(collection) + ').id';
  }
  return query;
};

/**
 * Builds the `UPDATE` sentence for the query from the options passed in to
 *         the adapter function.
 *
 * @method buildSelect
 *
 * @param  {String}    collection The Name of the Collection of Document Type
 *         name.
 * @param  {ColDef}    colDef     A Dictionary Object with the waterline
 *         internal definition of the schema of the model represented by the
 *         collection.
 * @param  {String}    bucket     The name of the Bucket holding the
 *         Collection or Document Type.
 * @param  {Object}    options    A dictionary Object with the waterline
 *         options for the operation.
 * @param  {Object}    values     A dictionary Object with the properties and values to update.
 *
 * @return {String}               The N1QL query to execute.
 */
n1ql.prototype.buildUpdate = function (collection, colDef, bucket, options, values) {
  var self = this;
  var set = '';
  if (values){
    set = ' SET ';
    var vals = [];
    _.forIn(values, function(value, key) {
      vals.push(key + ' = ' + self.prepareValue(value));
    });
    set += vals.join(', ');
  }
  var query = 'UPDATE ' + bucket + ' ' + self.scape(collection) + set + this.where(options.where, collection, bucket, colDef, options);
  if (!options.doNotReturn){
    query += ' RETURNING ' + self.scape(collection) + ', META(' + self.scape(collection) + ').id';
  }
  return query;
};

/**
 * Builds the condition form for every property in the where clause.
 *
 * @method wherePredicate
 *
 * @param  {Object}       where   The waterline where clause dictionary
 * @param  {String}       col     The Collection Name
 * @param  {Object}       colDef  Waterline internal schema definition for the collection.
 * @param  {Object}       options Dictionary with the Where clause coming from the Waterline request.
 *
 * @return {Array}               Array of strings with the where predicate for each condition.
 */
n1ql.prototype.wherePredicate = function(where, col, colDef, options){
  var self = this;
  var w = [];
  _.forIn(where, function (value, attr) {
    if (attr === 'or'){
      var or = [];
      var o;
      _.each(value, function(item) {
        o = self.wherePredicate(item, col, colDef, options);
        if (Array.isArray(o)){
          or.push('(' + o.join(' AND ') + ')');
        } else{
          or.push(o);
        }
      });
      w.push('(' + or.join(' OR ') + ')');
    } else if (_.isArray(value)){
      w.push(self.prepareWhereValue('IN', col, value, attr, colDef, options));
    } else if (typeof value === 'object') {
      //TODO: the _.forIn method should be outside of the if, just in case a findLike with more than one paratemer.

      // findLike workaround
      if (attr === 'like'){
        w.push(self.prepareWhereValue('like', col, _.values(value)[0], _.keys(value)[0], colDef, options));
      } else {  
        _.forIn(value, function (val, key) { //key = condition
          w.push(self.prepareWhereValue(key, col, val, attr, colDef, options));
        });
      }
    } else {
      w.push(self.prepareWhereValue('=', col, value, attr, colDef, options));
    }
  });
  return w;
};

/**
 * Builds the Where clause and returns the string to be included in the query.
 *
 * @method where
 *
 * @param  {Object}       where   The waterline where clause dictionary
 * @param  {String}       col     The Collection Name
 * @param  {String}       bucket  The bucket name where the Collection is stored.
 * @param  {Object}       colDef  Waterline internal schema definition for the
 *         collection.
 * @param  {Object}       options Dictionary with the Where clause coming from
 *         the Waterline request.
 *
 * @return {String}         A string with where clause to be included in the query.
 */
n1ql.prototype.where = function (where, col, bucket, colDef, options) {
  if (!bucket) {
    bucket = col;
  }
  var w = this.wherePredicate(where, col, colDef, options);
  if (col && bucket) {
    w.push('META(' + this.scape(col) + ').id LIKE "' + col + '::%"');
  }
  return ' WHERE ' + w.join(' AND ');
};

/**
 * Normalize and format the values for the where conditions
 *
 * @method prepareWhereValue
 *
 * @param  {String}          key     The conditional operator. See Waterline
 *         Documentation for more details on operators for comparison.
 * @param  {String}          col     The Collection Name
 * @param  {String|Array|number|Object|Date|*}          value   The value to
 *         use in the condition for the where predicate.
 * @param  {String}          attrStr The attribute name
 * @param  {Object}       colDef  Waterline internal schema definition for the
 *         collection.
 * @param  {Object}       options Dictionary with the Where clause coming from
 *         the Waterline request.
 *
 * @return {String|Array|number|Object|Date|*}  The value normalized to be
 *         used in the where clause.
 */
n1ql.prototype.prepareWhereValue = function (key, col, value, attrStr, colDef, options) {
  var rawValue = value;
  value = this.prepareValue(value, attrStr, colDef, options);
  attrStr = this.prepareAttrs(col, attrStr, colDef, options);
  if (key === '<' || key === 'lessThan') {
    return attrStr + '<' + value;
  } else if (key === '<=' || key === 'lessThanOrEqual') {
    return attrStr + '<=' + value;
  } else if (key === '>' || key === 'greaterThan') {
    return attrStr + '>' + value;
  } else if (key === '>=' || key === 'greaterThanOrEqual') {
    return attrStr + '>=' + value;
  } else if (key === '!' || key === 'not') {
    if (rawValue === null) {
      return attrStr + ' IS NOT NULL';
    } else if (_.isArray(rawValue)) {
      return '(' + attrStr + ' NOT IN [' + value + '])';
    } else if (typeof rawValue === 'string') {
      if (rawValue.toUpperCase() === 'MISSING') {
        return attrStr + ' IS NOT MISSING';
      }
    }
    return attrStr + '<>' + value;
  } else if (key === 'like') {
    return attrStr + ' LIKE ' + value;
  } else if (key === 'contains') {
    return attrStr + ' LIKE "%' + value.replace(/"/g, '') + '%"';
  } else if (key === 'startsWith') {
    return attrStr + ' LIKE "' + value.replace(/"/g, '') + '%"';
  } else if (key === 'endsWith') {
    return attrStr + ' LIKE "%' + value.replace(/"/g, '') + '"';
  } else if (key === '=') {
    if (value === null){
      return attrStr + ' IS NULL';
    }
    else if (isNaN(rawValue) && rawValue.toUpperCase() === 'MISSING'){
      return attrStr + ' IS MISSING';
    }
    return attrStr + ' = ' + value;
  }
  else if (key === 'IN'){
    return '(' + attrStr + ' IN [' + value + '])';
  } else {
    throw new Error('Unknown comparator: ' + key);
  }
};

/**
 * Prepares the attribute name for the where clause.
 *
 * @method prepareAttrs
 *
 * @param  {String}     col     Collection Name
 * @param  {String}     attr    Attribute Name
 * @param  {Object}       colDef  Waterline internal schema definition for the
 *         collection.
 * @param  {Object}       options Dictionary with the Where clause coming from
 *         the Waterline request.
 *
 * @return {String}             The string with the attribute name normalized to be used in the where clause.
 */
n1ql.prototype.prepareAttrs = function(col, attr, colDef, options) {
  if (colDef.primaryKey === attr){
    return 'META('+this.scape(col)+').id';
  }
  if (colDef.definition[attr].type === 'string' && !options.caseSensitive) {
    return 'lower('+ this.scape(col) + '.' + this.scape(attr) +')';
  }
  if (colDef.definition[attr].type === 'date') {
    return 'MILLIS('+ this.scape(col) + '.' + this.scape(attr) +')';
  }
  return this.scape(col) + '.' + this.scape(attr);
};


/**
 * Prepare the values to be used in the queries.
 *
 * @method prepareValue
 *
 * @param  {String|Array|number|Object|Date|*}          value   The value to
 *         use in the condition for the where predicate.
 * @param  {String}          attr The attribute name
 * @param  {Object}       colDef  Waterline internal schema definition for the
 *         collection.
 * @param  {Object}       options Dictionary coming from the Waterline request options.
 *
 * @return {[type]}             [description]
 */
n1ql.prototype.prepareValue = function (value, attr, colDef, options) {
  function prepare(val) {

    if (_.isFunction(val)) {
      return val.toString();
    }
    if (_.isArray(val)){
      return _.map(val, function(item) {
        return prepare(item);
      }).toString();
    }
    // DATES
    if (colDef && colDef.definition && colDef.definition[attr] ){
      if (colDef.definition[attr].type === 'date') {
        return 'MILLIS("' + moment(new Date(val)).format() + '")';
      }
      if (colDef.definition[attr].type === 'string') {
        if (!options.caseSensitive && isNaN(val) && attr !== colDef.primaryKey){
          val = val.toLowerCase();
        }
        return '"' + val + '"';
      }
    }
    if (_.isDate(val)){
      return '"' + moment(new Date(val)).format() + '"';
    }
    if (isNaN(val)){
      return '"' + val + '"';
    }
    return val;
  }
  return prepare(value);
};


/**
 * Scapes the string to be used in N1QL
 *
 * @method scape
 *
 * @param  {String} str The string to be Scaped.
 *
 * @return {String}     The string scaped in back tildes.
 */
n1ql.prototype.scape = function(str){ 
  return '`' + str + '`';
};
/**
 * Format and Normalize the N1QL Response in order to fulfill the waterline
 *         expectations.
 *
 * @method normalizeResponse
 *
 * @param  {Object|Array}         value The response coming from the
 *         N1QL Query Execution.
 * @param  {String}          collection The Collection or DocumentType Name.
 * @param  {Object}             options Dictionary coming from the Waterline
 *         request options.
 *
 * @return {Object|Array}                     The response normalized and formated.
 */
n1ql.prototype.normalizeResponse = function (value, collection, options) {
  if (options && options.select){
    return value;
  }
  function normalize(value, collection) { // also brings key
    //validate undefined Values
    if (value === undefined || value === null) {
      return undefined;
    }

    //recursive search of types.
    if (((collection && value[collection]) || Object.keys(value).length === 2) && value.id ) {      
      _.forIn(value, function( v, prop) {
        if (prop !== collection){
          value[collection][prop] = v; 
        }
      });
      value = value[collection];
    }
    if (value && value.constructor === Array) {
      return _.map(value, function(val) {
        return normalize(val, collection);
      });
    }
    if (typeof value === 'object') {
      return _.mapValues(value, function(val) {
        return normalize(val, collection);
      });
    }

    //////////////////////
    // Type Definitions //
    //////////////////////

    // validate floats
//    if(!isNaN(value) && !isNaN(parseFloat(value))) {
//      return value;
//    }

    //validate id
    var idReg = /\w+::[^\s]+/gim;
    if (typeof value === 'string' && idReg.test(value)){
      return value;
    }

    //validate Dates
//    if (typeof value === 'string' && Date.parse(value)) {
//      return new Date(value);
//    }
    return value;
  }
  return normalize(value, collection);
};
//*******************************************
// module export
//*******************************************
module.exports = n1ql;
