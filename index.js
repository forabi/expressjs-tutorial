var express = require("express");
var bodyParser = require("body-parser");

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
        response.render("post", { post: post, formatDate: formatDate });
        return;
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

    bcrypt.genSalt(10, function(err, salt) {
        bcrypt.hash(password, 8, function(err, hash) {
            if (err) {
                response.status(500);
                response.send("تعذّر إنشاء الحساب، تحقّق من سلامة المُدخلات وأعد المحاولة");
                return;
            }
            
            connection.query("INSERT INTO `users` (username, password, full_name) VALUES (?, ?, ?)", [username, hash, full_name], function(err) {
                if (err) {
                    response.status(400);
                    response.send("وقع خطأ أثناء إنشاء الحساب، أعد المحاولة");
                    return;
                }
                
                response.send("أُنشئ الحساب، يمكنك الآن تسجيل الدخول");
            });
        });
    });
})

app.listen(3000);