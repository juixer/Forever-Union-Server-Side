const express = require("express");
const app = express();
const cors = require("cors");
require("dotenv").config();
const port = process.env.PORT || 5000;
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
const cookieParser = require("cookie-parser");
const jwt = require("jsonwebtoken");
const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);

/////////////////////////////////////////// middleware///////////////////////////////////////

app.use(express.json());
app.use(
  cors({
    origin: [
      "http://localhost:5173",
      "https://forever-union.web.app",
      "https://forever-union.firebaseapp.com",
    ],
    credentials: true,
  })
);
app.use(cookieParser());

///////////////////////////////////////////////// mongodb server//////////////////////////

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
    /////////////////////////////////// DATABASE COLLECTION////////////////////////////////////

    const dataBase = client.db("forever_union");
    const bioDataCollection = dataBase.collection("biodatas");
    const usersCollection = dataBase.collection("users");
    const favCollection = dataBase.collection("favorites");
    const paymentCollection = dataBase.collection("payments");
    const contactReqCollection = dataBase.collection("contactRequests");
    const successStory = dataBase.collection("successStory");

    ////////////////////////////////////////////// JWT Authorization///////////////////////
    app.post("/jwt", async (req, res) => {
      const user = req.body;
      const token = jwt.sign(user, process.env.ACCESS_TOKEN, {
        expiresIn: "1h",
      });
      res
        .cookie("token", token, {
          httpOnly: true,
          secure: true,
          sameSite: "none",
        })
        .send({ status: true });
    });

    app.post("/logout", async (req, res) => {
      const user = req.body;
      res.clearCookie("token", { maxAge: 0 }).send({ status: true });
    });

    // token verify
    const verify = (req, res, next) => {
      const token = req?.cookies.token;
      if (!token) {
        return res.status(401).send({ message: "Unauthorized" });
      }
      jwt.verify(token, process.env.ACCESS_TOKEN, (err, decoded) => {
        if (err) {
          return res.status(401).send({ message: "Unauthorized" });
        }
        req.user = decoded;
        next();
      });
    };

    // admin verify
    const verifyAdmin = async (req, res, next) => {
      const email = req.user?.email;
      const query = { email: email };
      const user = await usersCollection.findOne(query);
      const isAdmin = user?.role === "admin";
      if (!isAdmin) {
        return res.status(403).send({ message: "forbidden access" });
      }
      next();
    };

    //////////////////////////////////////////// Users collections////////////////////////////

    // get admin
    app.get("/admin/:email", verify, async (req, res) => {
      const email = req.params.email;
      if (req.user.email !== email) {
        return res.status(403).send({ message: "forbidden access" });
      }
      const query = { email: email };
      const user = await usersCollection.findOne(query);
      let admin = false;
      if (user) {
        admin = user?.role === "admin";
      }
      res.send({ admin });
    });

    // get all users
    app.get("/users", verify, verifyAdmin, async (req, res) => {
      try {
        const search = req.query.search;
        const query = { name: { $regex: search, $options: "i" } };
        const result = await usersCollection.find(query).toArray();
        res.send(result);
      } catch (err) {
        console.log(err);
      }
    });

    // get user status
    app.get("/user/isPremium/:email", async (req, res) => {
      const email = req.params.email;
      const query = { email: email };
      const result = await usersCollection.findOne(query);
      res.send(result);
    });

    // get pending premium users
    app.get("/users/pending", verify, verifyAdmin, async (req, res) => {
      try {
        const query = { status: "pending" };
        const options = {
          projection: { status: 1, contactEmail: 1, biodataId: 1, name: 1 },
        };
        const result = await bioDataCollection.find(query, options).toArray();
        res.send(result);
      } catch (err) {
        console.log(err);
      }
    });

    // add users to users collection
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

    // make admin
    app.patch("/users/makeAdmin/:id", verify, verifyAdmin, async (req, res) => {
      try {
        const id = req.params.id;
        const query = { _id: new ObjectId(id) };
        const updateDoc = {
          $set: {
            role: "admin",
          },
        };
        const result = await usersCollection.updateOne(query, updateDoc);
        res.send(result);
      } catch (err) {
        console.log(err);
      }
    });

    // remove admin
    app.patch(
      "/users/removeAdmin/:id",
      verify,
      verifyAdmin,
      async (req, res) => {
        try {
          const id = req.params.id;
          const query = { _id: new ObjectId(id) };
          const updateDoc = {
            $set: {
              role: "guest",
            },
          };
          const result = await usersCollection.updateOne(query, updateDoc);
          res.send(result);
        } catch (err) {
          console.log(err);
        }
      }
    );

    // make premium users
    app.patch(
      "/users/makePremium/:email",
      verify,
      verifyAdmin,
      async (req, res) => {
        try {
          const email = req.params.email;
          const query = { email: email };
          const updateDoc = {
            $set: {
              status: "premium",
            },
          };
          const userResult = await usersCollection.updateOne(query, updateDoc);

          const bioDataQuery = { contactEmail: email };
          const bioDataResult = await bioDataCollection.updateOne(
            bioDataQuery,
            updateDoc
          );
          res.send({ userResult, bioDataResult });
        } catch (err) {
          console.log(err);
        }
      }
    );

    // make premium users
    app.patch(
      "/users/removePremium/:email",
      verify,
      verifyAdmin,
      async (req, res) => {
        try {
          const email = req.params.email;
          const query = { email: email };
          const updateDoc = {
            $set: {
              status: "normal",
            },
          };
          const userResult = await usersCollection.updateOne(query, updateDoc);

          const bioDataQuery = { contactEmail: email };
          const bioDataResult = await bioDataCollection.updateOne(
            bioDataQuery,
            updateDoc
          );
          res.send({ userResult, bioDataResult });
        } catch (err) {
          console.log(err);
        }
      }
    );

    ///////////////////////////////////////// BIO DATA COLLECTION///////////////////////////////////

    // get all biodata for card
    app.get("/biodatas", async (req, res) => {
      try {
        const minAge = parseInt(req.query.minAge);
        const maxAge = parseInt(req.query.maxAge);
        const gender = req.query.gender;
        const division = req.query.division;

        let query = {};

        if (minAge && maxAge) {
          query.age = { $gte: minAge, $lte: maxAge };
        }

        if (gender) {
          query.gender = gender;
        }

        if (division) {
          query.permanentDivision = division;
        }

        const page_size = 6;
        const page = req.query.page;

        const option = {
          projection: {
            biodataId: 1,
            gender: 1,
            name: 1,
            age: 1,
            occupation: 1,
            permanentDivision: 1,
            profileImage: 1,
          },
        };

        const count = await bioDataCollection.countDocuments(query);

        const result = await bioDataCollection
          .find(query, option)
          .skip(parseInt(page) * page_size)
          .limit(page_size)
          .toArray();

        res.send({ result, count });
      } catch (err) {
        console.log(err);
      }
    });

    // get premium user bio datas
    app.get("/biodatas/premium", async (req, res) => {
      try {
        const query = { status: "premium" };
        const option = {
          sort: { age: 1 },
          projection: {
            biodataId: 1,
            gender: 1,
            name: 1,
            age: 1,
            occupation: 1,
            permanentDivision: 1,
            profileImage: 1,
          },
        };
        const result = await bioDataCollection
          .find(query, option)
          .limit(6)
          .toArray();
        res.send(result);
      } catch (err) {
        console.log(err);
      }
    });

    // get pending Status

    // get single bio data information
    app.get("/biodata/:id", async (req, res) => {
      try {
        const id = req.params.id;
        const query = { _id: new ObjectId(id) };
        const result = await bioDataCollection.findOne(query);
        res.send(result);
      } catch (err) {
        console.log(err);
      }
    });

    // get gender wise data
    app.get("/biodatas/gender/:gender", async (req, res) => {
      try {
        const gender = req.params.gender;
        const query = { gender: gender };
        const option = {
          projection: {
            biodataId: 1,
            gender: 1,
            name: 1,
            age: 1,
            occupation: 1,
            permanentDivision: 1,
            profileImage: 1,
          },
        };
        const result = await bioDataCollection
          .aggregate([
            { $match: query },
            { $sample: { size: 3 } },
            { $project: option.projection },
          ])
          .toArray();
        res.send(result);
      } catch (err) {
        console.log(err);
      }
    });

    // get specific data
    app.get("/mydata/:email", async (req, res) => {
      try {
        const email = req.params.email;
        const query = { contactEmail: email };
        const result = await bioDataCollection.findOne(query);
        res.send(result);
      } catch (err) {
        console.log(err);
      }
    });

    // Insert bio data
    app.put("/biodatas", async (req, res) => {
      try {
        const bioData = req.body;

        const filter = { contactEmail: bioData.contactEmail };

        const existingBioData = await bioDataCollection.findOne(filter);

        if (existingBioData) {
          const updateDoc = {
            $set: {
              name: bioData.name,
              profileImage: bioData.profileImage,
              gender: bioData.gender,
              dateOfBirth: bioData.dateOfBirth,
              height: bioData.height,
              weight: bioData.weight,
              age: parseInt(bioData.age),
              occupation: bioData.occupation,
              race: bioData.race,
              fathersName: bioData.fathersName,
              mothersName: bioData.mothersName,
              expectedPartnerAge: bioData.expectedPartnerAge,
              expectedPartnerHeight: bioData.expectedPartnerHeight,
              expectedPartnerWeight: bioData.expectedPartnerWeight,
              contactEmail: bioData.contactEmail,
              mobileNumber: bioData.mobileNumber,
              permanentDivision: bioData.permanentDivision,
              presentDivision: bioData.presentDivision,
            },
          };
          const result = await bioDataCollection.updateOne(filter, updateDoc);
          res.send(result);
        } else {
          const totalBioData = await bioDataCollection.estimatedDocumentCount();

          const newBioData = {
            biodataId: totalBioData + 1,
            name: bioData.name,
            profileImage: bioData.profileImage,
            gender: bioData.gender,
            dateOfBirth: bioData.dateOfBirth,
            height: bioData.height,
            weight: bioData.weight,
            age: bioData.age,
            occupation: bioData.occupation,
            race: bioData.race,
            fathersName: bioData.fathersName,
            mothersName: bioData.mothersName,
            expectedPartnerAge: bioData.expectedPartnerAge,
            expectedPartnerHeight: bioData.expectedPartnerHeight,
            expectedPartnerWeight: bioData.expectedPartnerWeight,
            contactEmail: bioData.contactEmail,
            mobileNumber: bioData.mobileNumber,
            permanentDivision: bioData.permanentDivision,
            presentDivision: bioData.presentDivision,
          };

          const result = await bioDataCollection.insertOne(newBioData);
          res.send(result);
        }
      } catch (err) {
        console.log(err);
      }
    });

    // request for premium
    app.patch("/biodatas", async (req, res) => {
      try {
        const bioData = req.body;
        const filter = { contactEmail: bioData.contactEmail };
        const updateDoc = {
          $set: {
            status: bioData.status,
          },
        };
        const result = await bioDataCollection.updateOne(filter, updateDoc);
        res.send(result);
      } catch (err) {
        console.log(err);
      }
    });

    //////////////////////////////////////// favorite collections//////////////////////////////

    // get user wise favorites collection
    app.get("/favorite/:email", async (req, res) => {
      try {
        const email = req.params.email;
        const filter = { userEmail: email };
        const option = {
          sort: { _id: -1 },
        };
        const result = await favCollection.find(filter, option).toArray();
        res.send(result);
      } catch (err) {
        console.log(err);
      }
    });

    // insert favorite biodata
    app.post("/favorite", verify, async (req, res) => {
      try {
        const fav = req.body;
        const result = await favCollection.insertOne(fav);
        res.send(result);
      } catch (err) {
        console.log(err);
      }
    });

    // delete Favorite bio data
    app.delete("/favorite/:id", verify, async (req, res) => {
      try {
        const id = req.params.id;
        const query = { _id: new ObjectId(id) };
        const result = await favCollection.deleteOne(query);
        res.send(result);
      } catch (err) {
        console.log(err);
      }
    });

    ///////////////////////////////payments & contact request///////////////////////////////////////

    // get payment and contact information

    app.get("/contactRequest/:email", verify, async (req, res) => {
      try {
        const email = req.params.email;
        const query = { email: email };
        const result = await contactReqCollection.find(query).toArray();
        res.send(result);
      } catch (err) {
        console.log(err);
      }
    });

    // get only pending request
    app.get("/pendingContact", verify, verifyAdmin, async (req, res) => {
      try {
        const query = { contactStatus: "pending" };
        const result = await contactReqCollection.find(query).toArray();
        res.send(result);
      } catch (err) {
        console.log(err);
      }
    });

    // stripe

    app.post("/create-payment-intent", async (req, res) => {
      try {
        const { price } = req.body;

        const amount = parseInt(price * 100);
        console.log(amount);

        const paymentIntent = await stripe.paymentIntents.create({
          amount: amount,
          currency: "usd",
          payment_method_types: ["card"],
        });

        res.send({
          clientSecret: paymentIntent.client_secret,
        });
      } catch (err) {
        console.log(err);
      }
    });

    // insert payment

    app.post("/payments", async (req, res) => {
      try {
        const payment = req.body;

        const paymentDoc = {
          $set: {
            payment: payment.price,
            email: payment.email,
            name: payment.name,
            transID: payment.transID,
          },
        };

        const contactDoc = {
          $set: {
            email: payment.email,
            name: payment.name,
            reqName: payment.reqName,
            reqBiodataId: payment.reqBiodataId,
            userBiodataId: payment.userBiodataId,
            reqEmail: payment.reqEmail,
            reqPhone: payment.reqPhone,
            contactStatus: payment.contactStatus,
          },
        };

        const paymentResult = await paymentCollection.insertOne(
          paymentDoc.$set
        );
        const contactResult = await contactReqCollection.insertOne(
          contactDoc.$set
        );
        res.send({ paymentResult, contactResult });
      } catch (err) {
        console.log(err);
      }
    });

    // give user to contact request

    app.patch("/approveContactRequest/:id", async (req, res) => {
      try {
        const id = req.params.id;
        const query = { _id: new ObjectId(id) };

        const updateDoc = {
          $set: {
            contactStatus: "approved",
          },
        };
        const result = await contactReqCollection.updateOne(query, updateDoc);
        res.send(result);
      } catch (err) {
        console.log(err);
      }
    });

    // delete contact request
    app.delete("/contactRequest/:id", async (req, res) => {
      try {
        const id = req.params.id;
        const query = { _id: new ObjectId(id) };
        const result = await contactReqCollection.deleteOne(query);
        res.send(result);
      } catch (err) {
        console.log(err);
      }
    });

    ////////////////////////////SUccess Story Collection////////////////////////////

    app.get("/getSuccessStory", async (req, res) => {
      try {
        const option = {
          sort: { marriageDate: 1 },
        };
        const result = await successStory.find({}, option).toArray();
        res.send(result);
      } catch (err) {
        console.log(err);
      }
    });

    app.post("/successStory", async (req, res) => {
      try {
        const story = req.body;
        const result = await successStory.insertOne(story);
        res.send(result);
      } catch (err) {
        console.log(err);
      }
    });

    /////////////////////////////////////Stats COllection///////////////////////////////////

    app.get("/adminStats", verify, verifyAdmin, async (req, res) => {
      try {
        const totalPremiumQuery = { status: "premium" };

        const Revenue = await paymentCollection
          .aggregate([
            {
              $group: {
                _id: null,
                totalRevenue: {
                  $sum: "$payment",
                },
              },
            },
          ])
          .toArray();

        const totalRevenues = Revenue.length > 0 ? Revenue[0].totalRevenue : 0;

        const Premium = await bioDataCollection
          .find(totalPremiumQuery)
          .toArray();
        const totalPremium = Premium.length;

        res.send({ totalPremium, totalRevenues });
      } catch (err) {
        console.log(err);
      }
    });

    app.get("/getStats", async (req, res) => {
      try {
        const totalBioData = await bioDataCollection.estimatedDocumentCount();
        const totalMarriage = await successStory.estimatedDocumentCount();

        const totalBoyQuery = { gender: "Male" };
        const totalGirlQuery = { gender: "Female" };

        const Girls = await bioDataCollection.find(totalGirlQuery).toArray();
        const Boys = await bioDataCollection.find(totalBoyQuery).toArray();

        const totalBoys = Boys.length;
        const totalGirls = Girls.length;

        res.send({ totalBioData, totalBoys, totalGirls, totalMarriage });
      } catch (err) {
        console.log(err);
      }
    });

    //////////////////////////////////////mongodb connection////////////////////////////////
    // await client.db("admin").command({ ping: 1 });
    // console.log(
    //   "Pinged your deployment. You successfully connected to MongoDB!"
    // );
  } finally {
    // Ensures that the client will close when you finish/error
    // await client.close();
  }
}
run().catch(console.dir);

//////////////////////////////////////// default routes///////////////////////////////////

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
