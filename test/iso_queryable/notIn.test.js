'use strict';
/**
 * Test dependencies
 */
var Adapter = require('../../');
var waterline = require('waterline');
var bootstrap = require('./bootstrap.js');
var async = require('async');
var util = require('util');
  

describe('NOT IN Query Modifier', function() {

    var testName = 'NOT_IN_query_test';

    // Delete all the users in the collection
    before(function(done) {
      Queryable.User.destroy().exec(done);
    });

    describe('with a record', function() {

      /////////////////////////////////////////////////////
      // TEST SETUP
      ////////////////////////////////////////////////////

      before(function(done) {
        var users = [{ first_name: testName }, { first_name: 'something else' }];

        Queryable.User.createEach(users, function(err) {
          if(err) return done(err);
          done();
        });
      });

      /////////////////////////////////////////////////////
      // TEST METHODS
      ////////////////////////////////////////////////////

      it('should return correct user', function(done) {
        Queryable.User.find({ first_name: { '!': ["foo", testName, "bar", "baz"] }}, function(err, users) {
          assert(!err);
          assert.strictEqual(users.length, 1);
          assert.equal(users[0].first_name, 'something else');
          done();
        });
      });

      it('should return a model instance', function(done) {
        Queryable.User.find({ first_name: { '!': ["foo", testName, "bar", "baz"] }}, function(err, users) {
          assert(users[0].id);
          assert.equal(typeof users[0].fullName, 'function');
          assert.equal(toString.call(users[0].createdAt), '[object Date]');
          assert.equal(toString.call(users[0].updatedAt), '[object Date]');
          done();
        });
      });
    });

    describe('without a record', function() {

      /////////////////////////////////////////////////////
      // TEST METHODS
      ////////////////////////////////////////////////////

      it('should return an empty array', function(done) {
        Queryable.User.find({ first_name: { '!': ["foo", testName, "bar", "something else"] }}, function(err, users) {
          assert.strictEqual(users.length, 0);
          done();
        });
      });
    });

  });