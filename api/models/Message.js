/**
 * Friend.js
 *
 * @description :: TODO: You might write a short summary of how this model works and what it represents here.
 * @docs        :: http://sailsjs.org/documentation/concepts/models-and-orm/models
 */

module.exports = {

  tableName: 'messages',

  attributes: {
    id: { type: 'integer', primaryKey: true, autoIncrement: true },
    id_from: {
      type: 'integer',
      model: 'user'
    },
    id_to: {
      type: 'integer',
      model: 'user'
    },
    text: 'text',
    read: 'boolean',
    sent_on: 'datetime'
  }
};

