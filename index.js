var express = require("express");
var mysql = require("mysql");

var connection = mysql.createConnection({ host: "localhost", user: "root", password: "", database: "myblog" });
connection.connect();

var app = express();

app.get("/", function(request, response) {
    connection.query( "SELECT * from `posts` ORDER BY date DESC LIMIT 10;", function(err, posts) {
        if (err) throw err;

        var html = "<!DOCTYPE html><html lang='ar'>" +
        "<head><title>مُدوّنتي!</title></head>" +
        "<body>" + posts.map(function(post) { return "<li>" + post.title + "</li>"; })  .join("") + "</body></html>";
        
        response.send(html);
    });
    
});

app.listen(3000);