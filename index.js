const express = require("express");
const app = express();
const cors = require("cors");
require("dotenv").config();
const port = process.env.PORT || 5000;
const { MongoClient, ServerApiVersion } = require("mongodb");

// middleware for
app.use(express.json());
app.use(cors());

// mongodb server

const uri = process.env.MONGO_URI;
// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});
async function run() {
  try {
    // DATABASE COLLECTION
    const dataBase = client.db("forever_union");
    const bioDataCollection = dataBase.collection("biodatas");
    const usersCollection = dataBase.collection("users");

    // BIO DATA COLLECTION
    app.get("/biodatas", async (req, res) => {
      try {
        const option = {
          projection: {
            _id: 1,
            biodataId: 1,
            gender: 1,
            name: 1,
            age: 1,
            occupation: 1,
            permanentDivision: 1,
            profileImage: 1,
          },
        };
        const result = await bioDataCollection.find({}, option).toArray();
        res.send(result);
      } catch (err) {
        console.log(err);
      }
    });

    app.get("/biodatas/premium", async (req, res) => {
      try {
        const query = { status: "premium" };
        const option = {
          sort: { age: 1 },
          projection: {
            _id: 1,
            biodataId: 1,
            gender: 1,
            name: 1,
            age: 1,
            occupation: 1,
            permanentDivision: 1,
            profileImage: 1,
          },
        };
        const result = await bioDataCollection.find(query, option).toArray();
        res.send(result);
      } catch (err) {
        console.log(err);
      }
    });

    // Users collections
    app.post("/users", async (req, res) => {
      try {
        const user = req.body;
        const query = { email: user.email };
        const existedUser = await usersCollection.findOne(query);
        if (existedUser) {
          return { message: "User already exists" };
        }
        const result = await usersCollection.insertOne(user);
        res.send(result);
      } catch (err) {
        console.log(err);
      }
    });

    //

    await client.db("admin").command({ ping: 1 });
    console.log(
      "Pinged your deployment. You successfully connected to MongoDB!"
    );
  } finally {
    // Ensures that the client will close when you finish/error
    // await client.close();
  }
}
run().catch(console.dir);

// default routes
app.get("/", (req, res) => {
  res.send("Welcome to the Forever Server");
});

app.all("*", (req, res, next) => {
  const error = new Error(`The requested URL is invalid: ${req.url}`);
  error.status = 404;
  next(error);
});

app.use((err, req, res, next) => {
  res.status(err.status || 500).json({
    message: err.message,
  });
});

app.listen(port, () => {
  console.log(`you are listening on ${port}`);
});
