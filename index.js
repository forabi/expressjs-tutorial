var express = require("express");
var mysql = require("mysql");
var bcrypt = require("bcrypt");

// middlware
var bodyParser = require("body-parser");
var session = require('express-session');
var cookieParser = require('cookie-parser');
var methodOverride = require('method-override');

var moment = require("moment");
moment.locale("ar");

var formatDate = function(date) {
    return moment(new Date(date)).fromNow();
}

var connection = mysql.createConnection({
    host: "localhost",
    user: "root",
    password: "",
    database: "myblog"
});

connection.connect();

var app = express();

app.set("view engine", "jade");

app.use(session({
    secret: "my top secret",
    resave: true,
    saveUninitialized: true
}))

app.use(bodyParser.urlencoded({
    extended: true
}));

app.use(cookieParser());

app.use(methodOverride('_method'));

app.use(express.static(__dirname + '/public'));

app.use(function(request, response, next) {
    var session_id = request.cookies["connect.sid"];
    if (session_id) {
        connection.query("SELECT users.id, users.username, full_name, is_author FROM `users` JOIN `sessions` ON users.username=sessions.username WHERE session_id=?", [ session_id ], function(err, rows) {
            if (!err && rows[0]) {
                request.user = rows[0];
            }
            
            next();
        })
    } else {
        next();
    }
})

app.get("/", function(request, response) {
    connection.query("SELECT * from `posts` ORDER BY date DESC LIMIT 10;", function(err, posts) {
        response.render("home", { posts: posts, formatDate: formatDate });
    });
    
});

app.get("/posts/:slug", function(request, response, next) {
    var slug = request.params.slug;
    
    connection.query("SELECT * from `posts` WHERE slug = ?", [ slug ], function(err, rows) {
        if (err || rows.length == 0) {
            response.status(404);
            return next(new Error("التدوينة غير موجودة"));
        }
        
        var post = rows[0];
        connection.query("SELECT * FROM `comments` JOIN `users` ON comments.user_id=users.id WHERE post_id=?", [ post.id ], function(err, comments) {
            if (err) return next(err);
            post.comments = comments;
            response.render("post", { post: post, formatDate: formatDate, user: request.user });
        })
    });

})

app.get("/signup", function(request, response) {
    response.render("signup");
})

app.post("/accounts", function(request, response, next) {
    var username  = request.body.username,
        password  = request.body.password,
        full_name = request.body.name;
    
    if (!username || !password || username.length > 50) {
        response.status(400);
        return next(new Error("تعذّر إنشاء الحساب، تحقّق من سلامة المُدخلات وأعد المحاولة"));
    }

    bcrypt.hash(password, 8, function(err, hash) {
        if (err) {
            response.status(500);
            return next(new Error("تعذّر إنشاء الحساب، تحقّق من سلامة المُدخلات وأعد المحاولة"));
        }
        
        connection.query("INSERT INTO `users` (username, password, full_name) VALUES (?, ?, ?)", [username, hash, full_name], function(err) {
            if (err) {
                response.status(500);
                return next(new Error("وقع خطأ أثناء إنشاء الحساب، أعد المحاولة"));
            }
            
            response.status(201);
            response.redirect("/login");
        });
    });
})

app.get("/login", function(request, response) {
    response.render("login");
})


app.post("/sessions", function(request, response, next) {
    var username = request.body.username,
        password = request.body.password;
    
    if (!username || !password) {
        response.status(400);
        return next(new Error("يجب توفير اسم المستخدم وكلمة المرور"));
    }
    
    connection.query("SELECT username, password FROM `users` WHERE username=?", [ username ], function(err, rows) {
        var user = rows[0];
        if (!user) {
            response.status(400);
            return next(new Error("لا يوجد مستخدم يطابق اسمه اسم المستخدم المطلوب"));
        }
        
        bcrypt.compare(password, user.password, function(err, result) {
            if (err) {
                response.status(500);
                // response.error = { message: "وقع خطأ من جهة الخادم، حاول تسجيل الدخول لاحقًا" };
                return next(err);
            }
            
            if (result == true) {
                connection.query("INSERT INTO `sessions` (session_id, username) VALUES (?, ?)", [ request.cookies["connect.sid"], username ], function(err) {
                    if (err) {
                        response.status(500);
                        return next(err);
                    }
                    response.status(200);
                    response.redirect("/profile");
                })
                
            } else {
                response.status(401);
                return next(new Error("كلمة المرور التي أرسلتها خاطئة"));
            }
            
        })
    });
    
})

app.get("/profile", function(request, response, next) {
    response.render("profile", { user: request.user })
})

app.post("/posts/:slug/comments", function(request, response) {
    var body    = request.body.comment,
        user_id = request.user.id,
        slug    = request.params.slug,
        created = new Date();
    
    connection.query("SELECT id FROM `posts` WHERE slug=?", [ slug ], function(err, posts) {
        if (err) {
            response.status(500);
            return next(err);
        }

        var post_id = posts[0].id;
        connection.query("INSERT INTO `comments` (post_id, user_id, body, created) VALUES (?, ?, ?, ?)", [ post_id, user_id, body, created, slug ], function(err) {
            if (err) {
                response.status(500);
                response.send("تعذّرت إضافة التّعليق، حاول مجدّدًا.");
                return next(err);
            }
            
            response.status(201);
            response.redirect("/posts/" + slug);
        })
    })
    
})


app.get("/new", function(request, response, next) {
    if (request.user && request.user.is_author) {
        response.render("post-editor", { user: request.user });
    } else {
        response.status(403);
        return next(new Error("ليس لديك صلاحيات إضافة تدوينة."));
    }
})

app.post("/posts", function(request, response, next) {
    if (request.user && request.user.is_author) {
        var title = request.body.title,
            body = request.body.body,
            date = new Date(),
            author_id = request.user.id,
            slug = request.body.slug;
            
        connection.query("INSERT INTO `posts` (title, body, date, author_id, slug) VALUES (?, ?, ?, ?, ?)", [ title, body, date, author_id, slug ], function(err) {
            if (err) {
                response.status(500);
                response.send("تعّذرت إضافة التّدوينة");
                return next(err);
            }
            
            response.status(201);
            response.redirect("/posts/" + slug);
        })
    } else {
        response.status(403);
        response.error = { message: "ليس لديك صلاحيات إضافة تدوينة." };
        return next(err);
    }
})

app.get("/posts/:slug/edit", function(request, response, next) {
    if (request.user) {
        var user_id = request.user.id,
            slug    = request.params.slug;
        
        connection.query("SELECT * FROM `posts` WHERE author_id=? AND slug=?", [ user_id, slug ], function(err, rows) {
            if (!err && rows[0]) {
                response.render("post-editor", { post: rows[0] });
            } else {
                response.status(401);
                response.error = { message: "إمّا أن التّدوينة غير موجودة، أو أنّك لا تملك الصلاحيات للوصول إليها" };
                return next();
            }
        })
    } else {
        response.status(401);
        response.error = { message: "إمّا أن التّدوينة غير موجودة، أو أنّك لا تملك الصلاحيات للوصول إليها" };
        return next();
    }
    
})

app.put("/posts/:slug", function(request, response, next) {
    if (!request.user) {
        response.status(403);
        response.error = { message: "يجب تسجيل الدخول لتعديل التدوينات." };
        return next();
    }

    var slug = request.params.slug,
        new_title = request.body.title,
        new_body = request.body.body,
        user_id = request.user.id;
    
    connection.query("UPDATE `posts` SET title=?, body=? WHERE slug=? AND author_id=?", [ new_title, new_body, slug, user_id ], function(err) {
        if (err) {
            response.status("500");
            response.error = { message: "حدث خطأ أثناء تعديل التدوينة" };
            return next();
        }
        
        response.redirect("/posts/" + slug); 
    })
})

app.use(function(err, request, response, next) {
    response.render("error", { error: err, statusCode: response.statusCode })
})

app.listen(3000);