const dotenv = require('dotenv');
dotenv.config();
const express = require('express');
const cors = require('cors');
const compression = require('compression');
const multer = require('multer');
const { google } = require('googleapis');
const bodyParser = require('body-parser');
const mongoose = require('mongoose');
const nodemailer = require('nodemailer');
const cache = require('memory-cache');
const sharp = require('sharp');
const session = require('express-session');
const path = require('path');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcrypt');
const crypto = require('crypto');

const app = express();
app.use(express.json());
app.use(express.static('public'));
app.use(compression());
app.use(bodyParser.json({ limit: '50mb' }));
app.use(bodyParser.urlencoded({ extended: true, limit: '50mb' }));

// Enable sessions
app.use(
  session({
    secret: "vbn_the_web_dev",
    resave: false,
    saveUninitialized: false,
    cookie: {
      maxAge: 24 * 60 * 60 * 1000,
    },
  })
);

app.use(
  cors({
    origin: `${process.env.FRONTEND_URL}`,
    methods: "GET,POST,PUT,DELETE",
    credentials: true,
  })
);

const CLIENT_ID = process.env.CLIENT_ID;
const CLIENT_SECRET = process.env.CLIENT_SECRET;
const REDIRECT_URI = process.env.REDIRECT_URI;
const REFRESH_TOKEN = process.env.REFRESH_TOKEN;

const oAuth2Client = new google.auth.OAuth2(CLIENT_ID, CLIENT_SECRET, REDIRECT_URI);

oAuth2Client.setCredentials({ refresh_token: REFRESH_TOKEN });



mongoose
  .connect(process.env.MONGODB_URL, { useNewUrlParser: true, useUnifiedTopology: true })
  .then(() => {
    console.log('Connected to the MongoDB database');
  })
  .catch((error) => {
    console.error('Error while connecting to MongoDB', error);
  });

  const ReviewSchema = new mongoose.Schema({
    text: { type: String, require: true },
    name: { type: String, require: true },
    rating: { type: Number, require: true },
    date: { type: Date, default: Date.now },
  });
  
  const Review = mongoose.model('Review', ReviewSchema);




  const adminSchema = new mongoose.Schema({
    email: {
      type: String,
      required: true,
      unique: true,
    },
    password: {
      type: String,
      required: true,
    },
  });
  
  const Admin = mongoose.model('Admin', adminSchema);


  
  app.post('/reviews', async (req, res) => {
    try {
      console.log('Reviews API is called!');
  
      const accessToken = await oAuth2Client.getAccessToken();
      console.log('Access token:', accessToken);

  
      const { name, review, Rating } = req.body;
  
      const reviews = new Review({
        text: review,
        name: name,
        rating: Rating,
      });
  
      await reviews.save();
  
      const transporter = nodemailer.createTransport({
        service: 'Gmail',
        auth: {
          type: 'OAuth2',
          user: process.env.USER_MAIL,
          clientId: CLIENT_ID,
          clientSecret: CLIENT_SECRET,
          refreshToken: REFRESH_TOKEN,
          accessToken: accessToken,
        },
      });
  
      const mailOptions = {
        from: process.env.USER_MAIL,
        to: process.env.MAIL_TO,
        subject: 'New review submitted',
        text: `A new review has been submitted:\n\nReview:\n\n${review} by ${name} has given ${Rating} star Rating`,
        html: `<h1>A new review has been submitted:</h1><p>Review:<br>${review} by ${name} has given ${Rating} star Rating</p>`,
      };
  
      await transporter.sendMail(mailOptions);
  
      res.status(201).json({ message: 'Review submitted successfully' });
    } catch (error) {
      console.error('Error while submitting the review', error);
      res.status(500).json({ error: error.message });
    }
  });
  
  const ContactSchema = new mongoose.Schema({
    Query: { type: String, required: true },
    email: { type: String, required: true },
    contact: { type: String, required: true },
  });
  
  const Contact = mongoose.model('ClientContact', ContactSchema);
  app.post('/contact', async (req, res) => {
    try {
      const { Query, email, contact } = req.body;
  
      const client = new Contact({
        Query: Query,
        email: email,
        contact: contact,
      });
  
      await client.save();
  
      const newAccessToken = await oAuth2Client.getAccessToken();
  
      const transporter = nodemailer.createTransport({
        service: 'Gmail',
        auth: {
          type: 'OAuth2',
          user: process.env.USER_MAIL,
          clientId: CLIENT_ID,
          clientSecret: CLIENT_SECRET,
          refreshToken: REFRESH_TOKEN,
          accessToken: newAccessToken,
        },
      });
  
      const mailOptions = {
        from: process.env.USER_MAIL,
        to: process.env.MAIL_TO,
        subject: 'Client contact for service',
        text: `A new client ${email} has contacted for your service\n\nQuery:\t${Query} contact him at ${contact}`,
        html: `<p>A new client ${email} has contacted for your service</p><p>Query:<br>${Query} contact him at ${contact}</p>`,
      };
  
      await transporter.sendMail(mailOptions);
  
      // Return a success response to the client
      res.status(201).json({ success: true, message: 'Contact details saved successfully' });
    } catch (error) {
      console.error('Error while submitting the contact details', error);
      res.status(500).json({ success: false, error: error.message });
    }
  });
  
  app.get('/getreviews', async (req, res) => {
    try {
      console.log('Get review API is called');
  
      const cachedReviews = cache.get('cachedReviews');
      if (cachedReviews) {
        return res.json({ reviews: cachedReviews });
      }
  
      const reviewsArray = await Review.find();
      cache.put('cachedReviews', reviewsArray, 60 * 1000);
      res.json({ reviews: reviewsArray });
    } catch (error) {
      console.error('Error occurred:', error);
      res.status(500).json({ error: error.message, reviews: [] }); // Always return an array in the response
    }
  });
  

const projectSchema = new mongoose.Schema({
  category: String, // Add this line for category
  description: String,
  logo: Buffer,
  uiuxImages: [Buffer],
  githubRepoLink: String,
  deployedLink: String,
});

const Project = mongoose.model('Project', projectSchema);


const storage = multer.memoryStorage();
const upload = multer({ 
  storage: storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // Set the file size limit (e.g., 10MB)
});


const uploadFields = upload.fields([
  { name: 'logo', maxCount: 1 },
  { name: 'uiuxImages', maxCount: 10 },
]);

app.post('/uploadProject', uploadFields, async (req, res) => {
  try {
    const { category, description, githubRepoLink, deployedLink } = req.body; // Add category here

    const logoData = await sharp(req.files['logo'][0].buffer)
      .resize({ width: 1200, interpolation: 'lanczos3' })
      .jpeg({ quality: 100 })
      .toBuffer();

    const uiuxImagesData = await Promise.all(
      req.files['uiuxImages'].map(async file => {
        const resizedImage = await sharp(file.buffer)
          .resize({ width: 1200, interpolation: 'lanczos3' })
          .jpeg({ quality: 100 })
          .toBuffer();
        return resizedImage;
      })
    );

    const project = new Project({
      category, // Add category here
      description,
      logo: logoData,
      uiuxImages: uiuxImagesData,
      githubRepoLink,
      deployedLink,
    });

    await project.save();

    res.status(200).json({ message: 'Uploading projects successful' });
  } catch (error) {
    console.error('Error uploading project:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});


app.get('/getProjects', async (req, res) => {
  try {
    const cachedProjects = cache.get('cachedProjects');
    if (cachedProjects) {
      return res.json(cachedProjects);
    }

    const myProjects = await Project.find();
    cache.put('cachedProjects', myProjects, 60 * 1000); // Cache for 1 minute
    res.json(myProjects);
  } catch (error) {
    console.error('Error while fetching project details', error);
    res.status(500).json({ error: 'An error occurred' });
  }
});

const skillSchema = new mongoose.Schema({
  name: String,
  icon: Buffer,
  experience: String,
  duration: String,
});

const Skill = mongoose.model('Skill', skillSchema);

const secondStorage = multer.memoryStorage();
const skillUpload = multer({ storage: secondStorage });

app.post('/uploadSkill', skillUpload.single('icon'), async (req, res) => {
  try {
    const { name, experience, duration } = req.body;
    const iconData = req.file.buffer;

    const skill = new Skill({
      name,
      icon: iconData,
      experience,
      duration,
    });

    await skill.save();

    res.status(200).json({ message: 'Skill uploaded successfully' });
  } catch (error) {
    console.error('Error uploading skill:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

app.get('/getSkills', async (req, res) => {
  try {
    const cachedSkills = cache.get('cachedSkills');
    if (cachedSkills) {
      return res.json(cachedSkills);
    }

    const mySkills = await Skill.find();
    cache.put('cachedSkills', mySkills, 60 * 1000); 
    res.json(mySkills);
  } catch (error) {
    console.error('Error while fetching skill details', error);
    res.status(500).json({ error: 'An error occurred' });
  }
});




app.delete('/deleteReview/:id', async (req, res) => {
  try {
    const reviewId = req.params.id;
    const deletedReview = await Review.findByIdAndDelete(reviewId);

    if (!deletedReview) {
      return res.status(404).json({ error: 'Review not found' });
    }


    res.status(200).json({ message: 'Review deleted successfully' });
  } catch (error) {
    console.error('Error deleting review:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});





app.delete('/deleteProject/:id', async (req, res) => {
  try {
    const projectId = req.params.id;
    const deletedProject = await Project.findByIdAndDelete(projectId);

    if (!deletedProject) {
      return res.status(404).json({ error: 'Project not found' });
    }

    cache.del('cachedProjects');

    res.status(200).json({ message: 'Project deleted successfully' });
  } catch (error) {
    console.error('Error deleting project:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});


app.delete('/deleteSkill/:id', async (req, res) => {
  try {
    const skillId = req.params.id;
    const deletedSkill = await Skill.findByIdAndDelete(skillId);

    if (!deletedSkill) {
      return res.status(404).json({ error: 'Skill not found' });
    }

    cache.del('cachedSkills');

    res.status(200).json({ message: 'Skill deleted successfully' });
  } catch (error) {
    console.error('Error deleting skill:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});



const generateSecretKey = () => {
  const keyLength = 32; // 256 bits
  return crypto.randomBytes(keyLength).toString('hex');
};

const secretKey = generateSecretKey();

app.post('/login', async (req, res) => {
  const { email, password } = req.body;

  try {
    // Find the user by email in the admin collection
    const admin = await Admin.findOne({ email });

    if (!admin) {
      return res.status(401).json({ error: 'Authentication failed' });
    }

    // Compare the hashed password
    bcrypt.compare(password, admin.password, (err, result) => {
      if (err || !result) {
        return res.status(401).json({ error: 'Authentication failed' });
      }

      // Generate a JWT token
      const token = jwt.sign({ userId: admin.id, email: admin.email }, secretKey, {
        expiresIn: '1h', // Token expiration time
      });

      res.status(200).json({ userId: admin.id, token });
    });
  } catch (error) {
    console.error('Error while logging in:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});




app.get('/getAdminEmail', async (req, res) => {
  try {
    const token = req.headers.authorization?.split(' ')[1]; // Get the token from the authorization header

    if (!token) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    // Verify the token and extract the admin's email
    jwt.verify(token, secretKey, (err, decoded) => {
      if (err) {
        return res.status(401).json({ error: 'Token verification failed' });
      }

      // You can now access the admin's email as decoded.email
      const adminEmail = decoded.email;
      res.setHeader('Content-Type', 'application/json');

      res.status(200).json({ email: adminEmail });
    });
  } catch (error) {
    console.error('Error while fetching admin email:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});




const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server started on port ${PORT}`);
});































// const express = require('express');
// const cors = require('cors');
// const compression = require('compression');
// const multer = require('multer');
// const path = require('path');
// const { v4: uuidv4 } = require('uuid');
// const mongoose = require('mongoose');
// const nodemailer = require('nodemailer');
// const dotenv = require('dotenv');
// const cache = require('memory-cache');
// const sharp = require('sharp');
// dotenv.config();

// const { google } = require('googleapis');


// const CLIENT_ID = process.env.CLIENT_ID;
// const CLIENT_SECRET = process.env.CLIENT_SECRET;
// const REDIRECT_URI = process.env.REDIRECT_URI;
// const REFRESH_TOKEN = process.env.REFRESH_TOKEN;

// const oAuth2Client = new google.auth.OAuth2(CLIENT_ID, CLIENT_SECRET, REDIRECT_URI);

// oAuth2Client.setCredentials({ refresh_token: REFRESH_TOKEN });

// const app = express();
// app.use(cors());
// app.use(express.json());
// app.use(express.static('public'));
// app.use(compression());

// mongoose
//   .connect(process.env.MONGODB_URL, { useNewUrlParser: true, useUnifiedTopology: true })
//   .then(() => {
//     console.log('Connected to the MongoDB database');
//   })
//   .catch((error) => {
//     console.error('Error while connecting to MongoDB', error);
//   });
//   const ReviewSchema = new mongoose.Schema({
//     text: { type: String, require: true },
//     name: { type: String, require: true },
//     rating: { type: Number, require: true },
//     date: { type: Date, default: Date.now },
//   });
  
//   const Review = mongoose.model('Review', ReviewSchema);
  
//   app.post('/reviews', async (req, res) => {
//     try {
//       console.log('Reviews API is called!');
  
//       const accessToken = await oAuth2Client.getAccessToken();
//       console.log('Access token:', accessToken);

  
//       const { name, review, Rating } = req.body;
  
//       const reviews = new Review({
//         text: review,
//         name: name,
//         rating: Rating,
//       });
  
//       await reviews.save();
  
//       const transporter = nodemailer.createTransport({
//         service: 'Gmail',
//         auth: {
//           type: 'OAuth2',
//           user: process.env.USER_MAIL,
//           clientId: CLIENT_ID,
//           clientSecret: CLIENT_SECRET,
//           refreshToken: REFRESH_TOKEN,
//           accessToken: accessToken,
//         },
//       });
  
//       const mailOptions = {
//         from: process.env.USER_MAIL,
//         to: process.env.MAIL_TO,
//         subject: 'New review submitted',
//         text: `A new review has been submitted:\n\nReview:\n\n${review} by ${name} has given ${Rating} star Rating`,
//         html: `<h1>A new review has been submitted:</h1><p>Review:<br>${review} by ${name} has given ${Rating} star Rating</p>`,
//       };
  
//       await transporter.sendMail(mailOptions);
  
//       res.status(201).json({ message: 'Review submitted successfully' });
//     } catch (error) {
//       console.error('Error while submitting the review', error);
//       res.status(500).json({ error: error.message });
//     }
//   });
  
//   const ContactSchema = new mongoose.Schema({
//     Query: { type: String, required: true },
//     email: { type: String, required: true },
//     contact: { type: String, required: true },
//   });
  
//   const Contact = mongoose.model('ClientContact', ContactSchema);
  
//   app.post('/contact', async (req, res) => {
//     try {
//       const { Query, email, contact } = req.body;
  
//       const client = new Contact({
//         Query: Query,
//         email: email,
//         contact: contact,
//       });
  
//       await client.save();
  
//       const newAccessToken = await oAuth2Client.getAccessToken();
  
//       const transporter = nodemailer.createTransport({
//         service: 'Gmail',
//         auth: {
//           type: 'OAuth2',
//           user: process.env.USER_MAIL,
//           clientId: CLIENT_ID,
//           clientSecret: CLIENT_SECRET,
//           refreshToken: REFRESH_TOKEN,
//           accessToken: newAccessToken,
//         },
//       });
  
//       const mailOptions = {
//         from: process.env.USER_MAIL,
//         to: process.env.MAIL_TO,
//         subject: 'Client contact for service',
//         text: `A new client ${email} has contacted for your service\n\nQuery:\t${Query} contact him at ${contact}`,
//         html: `<p>A new client ${email} has contacted for your service</p><p>Query:<br>${Query} contact him at ${contact}</p>`,
//       };
  
//       await transporter.sendMail(mailOptions);
  
//       res.status(201).json({ message: 'Contact details saved successfully' });
//     } catch (error) {
//       console.error('Error while submitting the contact details', error);
//       res.status(500).json({ error: error.message });
//     }
//   });
  
//   app.get('/getreviews', async (req, res) => {
//     try {
//       console.log('Get review API is called');
  
//       const cachedReviews = cache.get('cachedReviews');
//       if (cachedReviews) {
//         return res.json({ reviews: cachedReviews });
//       }
  
//       const reviewsArray = await Review.find();
//       cache.put('cachedReviews', reviewsArray, 60 * 1000);
//       res.json({ reviews: reviewsArray });
//     } catch (error) {
//       console.error('Error occurred:', error);
//       res.status(500).json({ error: error.message, reviews: [] }); // Always return an array in the response
//     }
//   });
  

// const projectSchema = new mongoose.Schema({
//   category: String, // Add this line for category
//   description: String,
//   logo: Buffer,
//   uiuxImages: [Buffer],
//   githubRepoLink: String,
//   deployedLink: String,
// });

// const Project = mongoose.model('Project', projectSchema);


// const storage = multer.memoryStorage();
// const upload = multer({ storage });

// const uploadFields = upload.fields([
//   { name: 'logo', maxCount: 1 },
//   { name: 'uiuxImages', maxCount: 10 },
// ]);

// app.post('/uploadProject', uploadFields, async (req, res) => {
//   try {
//     const { category, description, githubRepoLink, deployedLink } = req.body; // Add category here

//     const logoData = await sharp(req.files['logo'][0].buffer)
//       .resize({ width: 1200, interpolation: 'lanczos3' })
//       .jpeg({ quality: 100 })
//       .toBuffer();

//     const uiuxImagesData = await Promise.all(
//       req.files['uiuxImages'].map(async file => {
//         const resizedImage = await sharp(file.buffer)
//           .resize({ width: 1200, interpolation: 'lanczos3' })
//           .jpeg({ quality: 100 })
//           .toBuffer();
//         return resizedImage;
//       })
//     );

//     const project = new Project({
//       category, // Add category here
//       description,
//       logo: logoData,
//       uiuxImages: uiuxImagesData,
//       githubRepoLink,
//       deployedLink,
//     });

//     await project.save();

//     res.status(200).json({ message: 'Uploading projects successful' });
//   } catch (error) {
//     console.error('Error uploading project:', error);
//     res.status(500).json({ message: 'Internal server error' });
//   }
// });


// app.get('/getProjects', async (req, res) => {
//   try {
//     const cachedProjects = cache.get('cachedProjects');
//     if (cachedProjects) {
//       return res.json(cachedProjects);
//     }

//     const myProjects = await Project.find();
//     cache.put('cachedProjects', myProjects, 60 * 1000); // Cache for 1 minute
//     res.json(myProjects);
//   } catch (error) {
//     console.error('Error while fetching project details', error);
//     res.status(500).json({ error: 'An error occurred' });
//   }
// });

// const skillSchema = new mongoose.Schema({
//   name: String,
//   icon: Buffer,
//   experience: String,
//   duration: String,
// });

// const Skill = mongoose.model('Skill', skillSchema);

// const secondStorage = multer.memoryStorage();
// const skillUpload = multer({ storage: secondStorage });

// app.post('/uploadSkill', skillUpload.single('icon'), async (req, res) => {
//   try {
//     const { name, experience, duration } = req.body;
//     const iconData = req.file.buffer;

//     const skill = new Skill({
//       name,
//       icon: iconData,
//       experience,
//       duration,
//     });

//     await skill.save();

//     res.status(200).json({ message: 'Skill uploaded successfully' });
//   } catch (error) {
//     console.error('Error uploading skill:', error);
//     res.status(500).json({ message: 'Internal server error' });
//   }
// });

// app.get('/getSkills', async (req, res) => {
//   try {
//     const cachedSkills = cache.get('cachedSkills');
//     if (cachedSkills) {
//       return res.json(cachedSkills);
//     }

//     const mySkills = await Skill.find();
//     cache.put('cachedSkills', mySkills, 60 * 1000); 
//     res.json(mySkills);
//   } catch (error) {
//     console.error('Error while fetching skill details', error);
//     res.status(500).json({ error: 'An error occurred' });
//   }
// });

// const PORT = process.env.PORT || 3000;
// app.listen(PORT, () => {
//   console.log(`Server started on port ${PORT}`);
// });



