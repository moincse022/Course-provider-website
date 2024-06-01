const express = require("express");
const app = express();
const cors = require('cors')
require("dotenv").config();
const port = process.env.PORT || 3000;
//HCQN5dCd2FhqqLlD
const stripe = require('stripe')(process.env.PAYMENT_SECRET);

// middleware
app.use(express.json());
app.use(cors());

const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.dkwsg.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0`;

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
    // Connect the client to the server	(optional starting in v4.7)
    await client.connect();
    const db = client.db("course_provider");
    const userCollection = db.collection("users");
    const classesCollection = db.collection("classes");
    const cartCollection = db.collection("cart");
    const enrolledCollection = db.collection("enrolled");
    const paymentCollection = db.collection("payments");
    const appliedCollection = db.collection("applied");

  app.post("/new-class", async (req, res) => {
      const newClass = req.body;
      const result = await classesCollection.insertOne(newClass);
      res.send(result);
  })
  app.get('/classes', async (req, res) => {
    const query = { status: 'approved' };
    const result = await classesCollection.find(query).toArray();
    res.send(result);
})
app.get('/classes/:email', async (req, res) => {
  const email = req.params.email;
  const query = { instructorEmail: email };
  const result = await classesCollection.find(query).toArray();
  res.send(result);
  
})
app.get('/classes-manage', async (req, res) => {
  const result=await classesCollection.find().toArray();
  res.send(result);
  
})
      // Change status of a class
      app.put('/change-status/:id',async (req, res) => {
        const id = req.params.id;
        const status = req.body.status;
        console.log(req.body)
        const reason = req.body.reason;
        const filter = { _id: new ObjectId (id) };
        console.log("🚀~ file: index.js:180 ~ app.put ~ reason:", reason)
        const options = { upsert: true };
        const updateDoc = {
            $set: {
                status: status,
                reason: reason
            }
        }
        const result = await classesCollection.updateOne(filter, updateDoc, options);
        res.send(result);
    })
     // * GET APPROVED CLASSES
   app.get('/approved-classes',async(req, res)=>{
      const query={status: 'approved'}
      const result=await classesCollection.find(query).toArray();
      res.send(result);
   })
  // Get single class by id for details page
  app.get('/class/:id', async (req, res) => {
    const id = req.params.id;
    const query = { _id: new ObjectId(id) };
    const result = await classesCollection.findOne(query);
    res.send(result);
  })
      // Update a class
      app.put('/update-class/:id', async (req, res) => {
        const id = req.params.id;
        const updatedClass = req.body;
        const filter = { _id: new ObjectId(id) };
        const options = { upsert: true };
        const updateDoc = {
            $set: {
                name: updatedClass.name,
                description: updatedClass.description,
                price: updatedClass.price,
                availableSeats: parseInt(updatedClass.availableSeats),
                videoLink: updatedClass.videoLink,
                status: 'pending'
            }
        }
        const result = await classesCollection.updateOne(filter, updateDoc, options);
        res.send(result);
    })
     // ADD TO CART
     app.post('/add-to-cart/', async (req, res) => {
        const cart = req.body;
        const result = await cartCollection.insertOne(cart);
        res.send(result);
     })
    //  GET CART ITEM
    app.get('/cart-item/:id', async (req, res) => {
      const id = req.params.id;
      const email = req.query.email;
      const query = { classId: id, userMail: email };
      const projection = { classId: 1 };
      const result = await cartCollection.findOne(query, { projection: projection });
      res.send(result);
  })
  app.get('/cart/:email',  async (req, res) => {
    const email = req.params.email;
    const query = { userMail: email };
    const projection = { classId: 1 };
    const carts = await cartCollection.find(query, { projection: projection }).toArray();
    const classIds = carts.map(cart => new ObjectId(cart.classId));
    const query2 = { _id: { $in: classIds } };
    const result = await classesCollection.find(query2).toArray();
    res.send(result);
})
app.delete('/delete-cart-item/:id', async (req, res) => {
    const id = req.params.id;
    const query = { _id: new ObjectId(id) };
    const result = await cartCollection.deleteOne(query);
    res.send(result);
})
 // PAYMENT ROUTES
 app.post('/create-payment-intent', verifyJWT, async (req, res) => {
  const { price } = req.body;
  const amount = parseInt(price) * 100;
  const paymentIntent = await stripe.paymentIntents.create({
      amount: amount,
      currency: 'usd',
      payment_method_types: ['card']
  });
  res.send({
      clientSecret: paymentIntent.client_secret
  });
})
// POST PAYMENT INFO 
app.post('/payment-info', verifyJWT, async (req, res) => {
  const paymentInfo = req.body;
  const classesId = paymentInfo.classesId;
  const userEmail = paymentInfo.userEmail;
  const singleClassId = req.query.classId;
  let query;
  // const query = { classId: { $in: classesId } };
  if (singleClassId) {
      query = { classId: singleClassId, userMail: userEmail };
  } else {
      query = { classId: { $in: classesId } };
  }
  const classesQuery = { _id: { $in: classesId.map(id => new ObjectId(id)) } }
  const classes = await classesCollection.find(classesQuery).toArray();
  const newEnrolledData = {
      userEmail: userEmail,
      classesId: classesId.map(id => new ObjectId(id)),
      transactionId: paymentInfo.transactionId,
  }
  const updatedDoc = {
      $set: {
          totalEnrolled: classes.reduce((total, current) => total + current.totalEnrolled, 0) + 1 || 0,
          availableSeats: classes.reduce((total, current) => total + current.availableSeats, 0) - 1 || 0,
      }
  }
  // const updatedInstructor = await userCollection.find()
  const updatedResult = await classesCollection.updateMany(classesQuery, updatedDoc, { upsert: true });
  const enrolledResult = await enrolledCollection.insertOne(newEnrolledData);
  const deletedResult = await cartCollection.deleteMany(query);
  const paymentResult = await paymentCollection.insertOne(paymentInfo);
  res.send({ paymentResult, deletedResult, enrolledResult, updatedResult });
})
   // ! ENROLLED ROUTES

   app.get('/popular_classes', async (req, res) => {
    const result = await classesCollection.find().sort({ totalEnrolled: -1 }).limit(6).toArray();
    res.send(result);
})
app.get('/popular-instructors', async (req, res) => {
  const pipeline = [
      {
          $group: {
              _id: "$instructorEmail",
              totalEnrolled: { $sum: "$totalEnrolled" },
          }
      },
      {
          $lookup: {
              from: "users",
              localField: "_id",
              foreignField: "email",
              as: "instructor"
          }
      },
      {
          $project: {
              _id: 0,
              instructor: {
                  $arrayElemAt: ["$instructor", 0]
              },
              totalEnrolled: 1
          }
      },
      {
          $sort: {
              totalEnrolled: -1
          }
      },
      {
          $limit: 6
      }
  ]
  const result = await classesCollection.aggregate(pipeline).toArray();
  res.send(result);

})
   // Admins stats 
   app.get('/admin-stats', verifyJWT, verifyAdmin, async (req, res) => {
    // Get approved classes and pending classes and instructors 
    const approvedClasses = (await classesCollection.find({ status: 'approved' }).toArray()).length;
    const pendingClasses = (await classesCollection.find({ status: 'pending' }).toArray()).length;
    const instructors = (await userCollection.find({ role: 'instructor' }).toArray()).length;
    const totalClasses = (await classesCollection.find().toArray()).length;
    const totalEnrolled = (await enrolledCollection.find().toArray()).length;
    // const totalRevenue = await paymentCollection.find().toArray();
    // const totalRevenueAmount = totalRevenue.reduce((total, current) => total + parseInt(current.price), 0);
    const result = {
        approvedClasses,
        pendingClasses,
        instructors,
        totalClasses,
        totalEnrolled,
        // totalRevenueAmount
    }
    res.send(result);

})

    // Send a ping to confirm a successful connection
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

app.get("/", (req, res) => {
  res.send("Hello World!");
});

app.listen(port, () => {
  console.log(`Example app listening on port ${port}`);
});
