const { MongoClient, ServerApiVersion } = require("mongodb");
const uri = process.env.ATLAS_URI;
const mongoose = require("mongoose");
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  }
});

var _db;
 
module.exports = {
  // connectToServer: async function () {
  //   try {
  //     await client.connect();
  //     _db = await client.db("talkingbooks");
  //     console.log("You successfully connected to MongoDB!");
  //   } catch(err) {
  //     console.log(err)
  //   }
  // },
  connectToMongoose: function () { 
    mongoose.connect(
      uri,
      {
        useNewUrlParser: true,
        useUnifiedTopology: true,
        dbName: 'talkingbooks'
      }
    )
    .then(() => {
      console.log("Successfully connected to MongoDB Atlas!");
    })
    .catch((error) => {
      console.log("Unable to connect to MongoDB Atlas!");
      console.error(error);
    });
  },
 
  getDb: function () {
    return _db;
  },
};