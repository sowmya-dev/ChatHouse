//to store sensitive data 
const dotenv = require('dotenv');
dotenv.config();
//lbrary to manage mongodb in node is mongoose ,accessing mongodb in nodejs  
const mongoose = require("mongoose");

const express = require("express");//backend nodejs frame work ,it Writes handlers for requests with different HTTP verbs at different(routes).
const unirest = require("unirest");//rest api - data communication  simplifies making http requests
const messageRequest = unirest("POST",process.env.SMS_API_ENDPOINT);//2 parameters one -type of request 2nd end point -  using already existing code to  send
const ejs = require("ejs");//embedded javascript -acts as a template  
const cookieParser = require("cookie-parser");//to deal with cookies, its a package ,inside browser the data is stored 
const socket = require('socket.io');
const app = express();

const port = process.env.PORT || 3000;//initialising port

//to check the database connectivity
mongoose.connect(process.env.DB_CONNECTION_STRING,{useUnifiedTopology:true,useNewUrlParser:true})
.catch(error =>{
    console.log("Error while connecting to the DB...");
})
.then(()=>{
    console.log("Successfully connected to the DB...");
});

// Schema for database 
const Schema = mongoose.Schema;

const userSchema = Schema({
    name:String,
    password:String,
    ph_no:Number,
    rooms:[
        {
            room_name:String
        }
    ]
});

const roomSchema = Schema({
    name:String,
    users:[
        {
            name:String,
            alias:String,
            ph_no:Number
        }
    ]
});

// Models 
const User = mongoose.model("User",userSchema);
const Room = mongoose.model("Room",roomSchema);

app.use(express.urlencoded({extended:true}));
app.use(express.static("public"));//path to files is imp no matter where the code is deployed
app.set("view engine","ejs");//model view controller 
app.use(cookieParser());

// Helper Methods
// Function to generate OTP
function generateOTP() {
          
    // Declare a digits variable 
    // which stores all digits
    var digits = '0123456789';
    let OTP = '';
    for (let i = 0; i < 4; i++ ) {
        OTP += digits[Math.floor(Math.random() * 10)];
    }
    return OTP;
}

// Context Variables
const indexContext = {"message":null,"rooms":[]};


Room.find({},(error, rooms)=>{
    if(error){
        console.log("Error while fetching rooms from DB");
    }

    indexContext.rooms = rooms;
});

const loginContext = {"message":null,"isError":false};
const registerContext = {"message":null,"isError":false};

// Login View
app.route("/")
.get((req, res)=>{

    if(req.cookies["isLoggedIn"]){
        res.redirect("/index");
    }else{
        res.render("login",loginContext);
    }
})
.post((req, res)=>{

    // Validate User Login
    const userProvidedName = req.body.user_name;
    const userProvidedPassword = req.body.user_password;

    const queryObject = {
        name:userProvidedName
    };
    User.findOne(queryObject,(error, user)=>{
        if (error){
            console.log("Error while fetching user from DB");
        }
        else{

            // User successfully authenticated
            if (user.name === userProvidedName && user.password === userProvidedPassword){

                // Set User Logged-in status
                res.cookie("userName",user.name,{maxAge:1*60*60*1000,httpOnly:true});
                res.cookie("userMobile",user.ph_no,{maxAge:1*60*60*1000,httpOnly:true});
                res.cookie("isLoggedIn",true,{maxAge:1*60*60*1000,httpOnly:true});

                indexContext.message = "";
                res.render("index",indexContext);
            }
            else{
                // Render login with invalid username/ password error message
                loginContext.message = "Invalied Username/ Password";
                loginContext.isError = true
                res.render("login",loginContext);
            }
        }
    });
});

// Registration View
app.route("/register")
.get((req, res)=>{
    res.render("register",registerContext);
})
.post((req, res)=>{

    // Confirm Password and Create User
    // Take user to login page
    const password = req.body.password;
    const re_password = req.body.re_password;
    if (password === re_password){

        // Create User and save to DB
        const newUser = {
            name:req.cookies["userName"],
            password:password,
            mobile:req.cookies["mobile"],
            rooms:[],
            messages:[]
        };

        User.insertMany([newUser],(error)=>{
            if(error){
                console.log("Error while saving user to the DB");
            }
            else{
                // Render login account created message
                loginContext.message = "Account Successfully Created";
                loginContext.isError = false;
                res.render("login",loginContext);     
            }
        });
    }
    else{

        // Render register with password wrong message
        registerContext.message = "The Passwords Did Not Match";
        registerContext.isError = true;
        res.render("register",registerContext);
    }
});

// OTP View
app.post("/otp",(req, res)=>{

    const userName = req.body.user_name;
    const mobileNumber = req.body.mobile;

    // Check if a user with the same username exists or not
    const queryObject = {name:userName};
    User.findOne(queryObject,(error, user)=>{
        if (error){
            console.log("Error while fetching user from DB");
        }else if (user){

            // Render register with user already exists error message
            registerContext.message = "A Username Already Exists";
            registerContext.isError = true;
            res.render("register",registerContext);

        }else{

            // Set cookies
            res.cookie("userName",userName);
            res.cookie("mobile",mobileNumber);

            const otp = generateOTP();

            // Logic for sending the OTP
            messageRequest.headers({
                "authorization": process.env.SMS_API_KEY//authorised users calling api key
            });
            
            messageRequest.form({
            "variables_values": `${otp}`,//f literal strings 
            "route": "otp",
            "numbers": `${mobileNumber}`,
            });
            
            messageRequest.end(function (res) {
                if (res.error) 
                {
                    throw new Error(res.error);
                }
                console.log(res.body);
            });

            // Set cookie variable 
            //otp validation
            res.cookie("otp",otp);
            res.render("otp");
        }
    });
});

// Authenticate the otp
app.post("/authenticate",(req, res)=>{

    // Verify OTP
    if (req.body.userEnteredOTP === req.cookies["otp"]){

        res.clearCookie("otp");
        res.render("setPassword");
    }else{

        // Render register with otp wrong message
        registerContext.message = "OTP Entered is Wrong";
        registerContext.isError = true;
        res.render("register", registerContext);
    }
});

app.get("/index",(req, res)=>{

    Room.find({},(error,rooms)=>{            //{} -gets all rooms

        indexContext.rooms = rooms;
        res.render("index",indexContext);
    });
});

app.post("/create-room",(req, res)=>{

    const roomName = req.body.room_name_create;
    const newRoom  = {
        name:String(roomName).toLowerCase(),
        users:[]
    };
    Room.insertMany([newRoom],(error)=>{
        if(error){
            console.log("Error while creating the room");
        }else{

            User.findOne({name:req.cookies["userName"]},(error, user)=>{
                if(error){
                    console.log("Error while fetching user from DB");
                }

                const room = {
                    room_name:roomName
                };

                user.rooms.push(room);

                user.save(()=>{
                    res.redirect("/index");
                });
            });
        }
    });
});
// Logout
app.get("/logout",(req, res)=>{

    res.cookie("isLoggedIn",false);
    res.clearCookie("userName");
    res.clearCookie("userMobile");

    loginContext.message = "You Have Been Successfully Logged Out";
    res.render("login",loginContext);

});

// Chat App Module
//Get username and roomname from form and pass it to room
app.post('/room', (req, res) => {
    const roomname = req.body.roomname;
    const username = req.body.username;

    const queryObject = {name:String(roomname).toLowerCase()};
    Room.findOne(queryObject,(error, room)=>{

        if(error){
            console.log("Error while fectching rooms from DB");
        }else if (room === null){

            indexContext.message = "Room Does Not Exist, Try Creating the Room";
            res.render("index",indexContext);
        }else{

            // Set Room Cookie
            res.cookie("roomName",roomname);

            const newRoomuser = {
                name:req.cookies["userName"],
                alias: username,
                ph_no: req.cookies["userMobile"]
            };
    
            const usersInRoom = room.users;
            usersInRoom.push(newRoomuser);
            room.users = usersInRoom;
            room.save(()=>{
                res.redirect(`/room?username=${username}&roomname=${roomname}`);
            });
        }
    })
});

app.post("/leave-room",(req, res)=>{

    const room = req.cookies["roomName"];

    // Delete Room Name from the Cookie
    res.clearCookie("roomName");
    
    Room.findOne({name:room},(error, room)=>{
        if(error){
            console.log("Error while fetching room from DB");
        }

        room.users = room.users.filter( user => user.name !== req.cookies["userName"]);
        room.save(()=>{
            res.redirect("/index");
        });
    });
});

//Rooms
app.get('/room', (req, res)=>{
    res.render('room')
})

// PORT
const server = app.listen(port,()=>{
    console.log(`Port started on server ${port}...`);
});

const io = socket(server);
require('./utils/socket')(io);