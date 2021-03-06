import { PubSub } from "graphql-subscriptions";
import { Result } from "interface-datastore";
import { JSONSchema7 } from "json-schema";
import { GraphQLObjectType, GraphQLString, Thunk, GraphQLFieldConfigMap, GraphQLSchema, GraphQLID, GraphQLBoolean, GraphQLList } from "graphql";
let pluralize = require('pluralize');
import { TextileThread } from "./textileThreads";

export const pubsub = new PubSub();

export interface Quant {
  ID: string;
  name: string;
  icon: string;
  jsonSchema: string;
  collectionName: string;
}
export const QuantSchema: JSONSchema7 = {
  $id: "https://example.com/quant.schema.json",
  $schema: "http://json-schema.org/draft-07/schema#",
  title: "Library",
  type: "object",
  required: ["_id"],
  properties: {
    _id: {
      type: "string",
      description: "The instance's id.",
    },
    name: {
      type: "string",
      description: "name for displaying in views"
    },
    icon: {
      type: "string",
      description: "icon for displaying in views"
    },
    jsonSchema: {
      type: "string",
      description: "json-schema as string registering in textile"
    },
    collectionName: {
      type: "string",
      description: "name for register schema in threadDB"
    }
  }
};
export const LibrarySchema: JSONSchema7 = {
  $id: "https://example.com/person.schema.json",
  $schema: "http://json-schema.org/draft-07/schema#",
  title: "Library",
  type: "object",
  required: ["_id"],
  properties: {
    _id: {
      type: "string",
      description: "The instance's id.",
    },
    name: {
      type: "string",
      description: "Branch Name",
    },
    dummy1: {
      type: "string",
      description: "Branch Name",
    },
    dumm2: {
      type: "string",
      description: "Branch Name",
    },
  },
};
export const BookSchema: JSONSchema7 = {
  $id: "https://example.com/person.schema.json",
  $schema: "http://json-schema.org/draft-07/schema#",
  title: "Book",
  type: "object",
  required: ["_id"],
  properties: {
    _id: {
      type: "string",
      description: "The instance's id.",
    },
    name: {
      type: "string",
      description: "The book title",
    }
  },
};
export const AuthorSchema: JSONSchema7 = {
  $id: "https://example.com/person.schema.json",
  $schema: "http://json-schema.org/draft-07/schema#",
  title: "Author",
  type: "object",
  required: ["_id"],
  properties: {
    _id: {
      type: "string",
      description: "The instance's id.",
    },
    name: {
      type: "string",
      description: "The book title",
    }
  },
};
export async function getSchema() {

  const textileThread = TextileThread.getInstance(null);
  var quanta = await textileThread.getQuanta();
  quanta = quanta.filter(x => x.name && x.jsonSchema && x.collectionName && x.name != "null" && x.jsonSchema != "null" && x.collectionName != "null");

  quanta.forEach(async quant => {
    if (!textileThread.collections.has(quant.collectionName, []) && quant.collectionName && quant.jsonSchema) {
      await textileThread.collections.newCollection(quant.collectionName, JSON.parse(quant.jsonSchema))
    }
  })
  let map = getQuantTypeMap(quanta);

  const schema = new GraphQLSchema({
    query: new GraphQLObjectType({
      fields: getQueries(map),
      name: "query",
    }),
    mutation: new GraphQLObjectType({
      fields: getMutations(map),
      name: "mutation"
    }),
    subscription: new GraphQLObjectType({
      fields: getSubscriptions(map),
      name: "subscription"
    })
  });
  return schema;
}
function getSubscriptions(map: Map<Quant, GraphQLObjectType>): Thunk<GraphQLFieldConfigMap<any, any>> {
  const textileThread = TextileThread.getInstance(null);
  var subscriptions: Thunk<GraphQLFieldConfigMap<any, any>> = {};
  map.forEach((type, quant) => {

    subscriptions[pluralize(quant.name)] = {
      type: GraphQLList(type),
      subscribe: async () => pubsub.asyncIterator(quant.collectionName + "_changed"),
      resolve: async () => await textileThread.collections.find(quant.collectionName, {})
    };
    subscriptions[`${quant.name}ById`] = {
      args: { ID: { type: GraphQLID } },
      type: type,
      subscribe: async (root: any, data: any) => pubsub.asyncIterator(data.ID + "_changed"),
      resolve: async (payload: any) => { console.log(JSON.stringify(payload)); return await textileThread.collections.findById(quant.collectionName, payload.id); }
    };
    subscriptions[quant.name + "Added"] = {
      type: type,
      subscribe: async () => pubsub.asyncIterator(quant.collectionName + "_added"),
      resolve: async (id: string) => await textileThread.collections.findById(quant.collectionName, id)
    };
    subscriptions[quant.name + "Updated"] = {
      type: type,
      subscribe: async () => pubsub.asyncIterator(quant.collectionName + "_updated"),
      resolve: async (id: string) => await textileThread.collections.findById(quant.collectionName, id)
    };
    subscriptions[quant.name + "Deleted"] = {
      type: GraphQLID,
      subscribe: async () => pubsub.asyncIterator(quant.collectionName + "_deleted"),
      resolve: async (id: string) => id
    };
  })
  return subscriptions;
}
function getQueries(map: Map<Quant, GraphQLObjectType>): Thunk<GraphQLFieldConfigMap<any, any>> {
  var queries: Thunk<GraphQLFieldConfigMap<any, any>> = {};
  var textileThread = TextileThread.getInstance();
  map.forEach((type, quant) => {
    queries[pluralize(quant.name)] = {
      type: GraphQLList(type),
      resolve: async () => {
        return await textileThread.collections.find(quant.collectionName, {})
      }
    };

    queries[quant.name + 'ById'] = {
      type,
      args: { ID: { type: GraphQLID } },
      resolve: async (root: any, payload: any) => await textileThread.collections.findById(quant.collectionName, payload.ID)
    };
  })
  return queries;
}
function getMutations(map: Map<Quant, GraphQLObjectType>): Thunk<GraphQLFieldConfigMap<any, any>> {
  var mutations: Thunk<GraphQLFieldConfigMap<any, any>> = {};
  const textileThread = TextileThread.getInstance(null);

  map.forEach((type, quant) => {
    let schema = JSON.parse(quant.jsonSchema);
    let args = getArguments(schema);
    mutations[`add${quant.name}`] = {
      args,
      resolve: async (root: any, data: any) => {
        await textileThread.collections.add(quant.collectionName, data);
        return data;
      },
      type
    };
    mutations[`update${quant.name}`] = {
      args,
      resolve: async (root: any, data: any) => {
        var entity = await textileThread.collections.findById(quant.collectionName, data.ID);
        Object.keys(data).forEach(key => entity[key] = data[key]);
        await textileThread.collections.update(quant.collectionName, data);
        return data;
      },
      type
    };
    mutations[`addOrUpdate${quant.name}`] = {
      args,
      resolve: async (root: any, data: any) => {
        var entity;
        if (data.ID) {
          entity = await textileThread.collections.findById(quant.collectionName, data.ID);
          Object.keys(data).forEach(key => entity[key] = data[key]);
          await textileThread.collections.add(quant.collectionName, data);
          return entity;
        } else {
          await textileThread.collections.update(quant.collectionName, data);
        }
        return entity;
      },
      type
    };
    mutations[`delete${quant.name}`] = {
      args: { ID: { type: GraphQLID } },
      resolve: async (root: any, data: any) => {
        try {
          await textileThread.collections.delete(quant.collectionName, [data.ID]);
          return true;
        }
        catch (e) {
          return false;
        }
      },
      type: GraphQLBoolean
    };
  })
  return mutations;
}
function getArguments(schema: JSONSchema7) {
  var args = {};
  if (schema.properties)
    Object.keys(schema.properties).forEach(key => {
      args[key] = {
        type: GraphQLString
      }
    })
  return args;
}
function getQuantTypeMap(quanta: Quant[]): Map<Quant, GraphQLObjectType<any, any>> {
  var map: Map<Quant, GraphQLObjectType<any, any>> = new Map();
  quanta.forEach(quant => {
    map.set(quant, new GraphQLObjectType({
      fields: getFields(quant),
      name: quant.name
    }));
  })
  return map;
}
function getFields(quant: Quant): Thunk<GraphQLFieldConfigMap<any, any>> {
  var schema: JSONSchema7 = JSON.parse(quant.jsonSchema);
  var fields: Thunk<GraphQLFieldConfigMap<any, any>> = {};

  if (schema.properties) {
    let properties = Object.keys(schema.properties);
    properties.forEach(property => {
      fields[property] = { type: GraphQLString }
    });
  }
  return fields;
}