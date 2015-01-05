var express = require("express");
var bodyParser = require("body-parser");

var session = require('express-session');
var cookieParser = require('cookie-parser');

var mysql = require("mysql");

var bcrypt = require("bcrypt");

var moment = require("moment");
moment.locale("ar");

var formatDate = function(date) {
    return moment(new Date(date)).fromNow();
}

var connection = mysql.createConnection({ host: "localhost", user: "root", password: "", database: "myblog" });
connection.connect();

var app = express();

app.use(session({
    secret: "my top secret",
    resave: true,
    saveUninitialized: true
}));

app.use(cookieParser());

app.use(function(request, response, next) {
    var session_id = request.cookies["connect.sid"];
    if (session_id) {
        connection.query("SELECT users.id, users.username, full_name, is_author FROM `users` JOIN `sessions` ON users.username=sessions.username WHERE session_id=\"?\"", [ session_id ], function(err, rows) {
            if (!err && rows[0]) {
                request.user = rows[0];
            }
            
            next();
        })
    } else {
        next();
    }
})

app.set("view engine", "jade");

app.get("/", function(request, response) {
    connection.query( "SELECT * from `posts` ORDER BY date DESC LIMIT 10;", function(err, posts) {
        response.render("home", { posts: posts, formatDate: formatDate });
    });
    
});

app.get("/posts/:slug", function(request, response, next) {

    var slug = request.params.slug;
    
    connection.query("SELECT * from `posts` WHERE slug = ?", [ slug ], function(err, rows) {
        if (err || rows.length == 0) return next();
        var post = rows[0];
        connection.query("SELECT * FROM `comments` JOIN `users` ON comments.user_id=users.id WHERE post_id=?", [ post.id ], function(err, comments) {
            if (err) return next(err);
            post.comments = comments;
            response.render("post", { post: post, formatDate: formatDate, user: request.user });
        })
    });

})

app.get("/posts/:slug", function(request, response) {
    response.status(404);
    response.send("التدوينة غير موجودة");
})

app.get("/signup", function(request, response) {
    response.render("signup");
})

var parseBody = bodyParser.urlencoded({ extended: true });

app.post("/accounts", parseBody, function(request, response) {
    var username = request.body.username;
    var password = request.body.password;
    var full_name = request.body.name;
    
    if (!username || !password || username.length > 50) {
        response.status(400);
        response.send("تعذّر إنشاء الحساب، تحقّق من سلامة المُدخلات وأعد المحاولة");
        return;
    }

    bcrypt.hash(password, 8, function(err, hash) {
        if (err) {
            response.status(500);
            response.send("تعذّر إنشاء الحساب، تحقّق من سلامة المُدخلات وأعد المحاولة");
            return;
        }
        
        connection.query("INSERT INTO `users` (username, password, full_name) VALUES (?, ?, ?)", [username, hash, full_name], function(err) {
            if (err) {
                response.status(500);
                response.send("وقع خطأ أثناء إنشاء الحساب، أعد المحاولة");
                return;
            }
            
            response.status(201);
            response.send("أُنشئ الحساب، يمكنك الآن تسجيل الدخول");
        });
    });
})

app.get("/login", function(request, response) {
    response.render("login");
})


app.post("/sessions", parseBody, function(request, response) {
    var username = request.body.username;
    var password = request.body.password;
    
    if (!username || !password) {
        response.status(400);
        response.send("يجب توفير اسم المستخدم وكلمة المرور");
        return;
    }
    
    connection.query("SELECT username, password FROM `users` WHERE username=?", [ username ], function(err, rows, next) {
        var user = rows[0];
        if (!user) {
            response.status(400);
            response.send("لا يوجد مستخدم يطابق اسمه اسم المستخدم المطلوب");
            return;
        }
        
        bcrypt.compare(password, user.password, function(err, result, next) {
            if (err) {
                response.status(500);
                response.send("وقع خطأ من جهة الخادم، حاول تسجيل الدخول لاحقًا");
                return;
            }
            
            if (result == true) {
                connection.query("INSERT INTO `sessions` (session_id, username) VALUES (\"?\", ?)", [ request.cookies["connect.sid"], username ], function(err) {
                    if (err) return next(err); // تعامل مع الخطأ
                    response.status(200);
                    response.send("تم تسجيل الدّخول");
                })
                
            } else {
                response.status(401);
                response.send("كلمة المرور التي أرسلتها خاطئة");
            }
            
        })
    });
    
})

app.get("/profile", function(request, response) {
    response.render("profile", { user: request.user })
})

app.post("/posts/:post_id/comments", parseBody, function(request, response) {
    console.log(request.user);
    var body = request.body.comment;
    var user_id = request.user.id;
    var post_id = request.params.post_id;
    var created = new Date();
    
    connection.query("INSERT INTO `comments` (post_id, user_id, body, created) VALUES (?, ?, ?, ?)", [ post_id, user_id, body, created ], function(err) {
        if (err) {
            console.log(err);
            response.status(500);
            response.send("تعذّرت إضافة التّعليق، حاول مجدّدًا.");
            return;
        }
        
        response.status(201);
        response.send("أُضيف التعليق");
    })
})


app.listen(3000);