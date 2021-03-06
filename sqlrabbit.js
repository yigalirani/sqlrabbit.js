'use strict'
const express = require('express')
const session = require('express-session')
const app = express()
app.use(session({ secret: 'beyond keyboard', cookie: { maxAge: 6000000 }}))

app.use(express.static('media')) //all that needss to do to serve the static files
app.use((req, res, next) =>{
  req.start=parseInt(req.query.start)||0
  next()
})
const mustache=require('mustache');
const _=require('lodash');
const fs = require('fs');
var mysql      = require('mysql');
const nav_copy_fields=['sort', 'database', 'query', 'table', 'action', 'dir']
const conn_fields=['host', 'user', 'password', 'database']
const max_rows=100

var template = read_template('templates/template.htm');
var login_template = read_template('templates/login_template.htm')
function read_template(file_name){
    return fs.readFileSync(file_name,'utf8')
}
function render(template, view, view2, view3) {
    var merged=_.extend({},view, view2, view3)
    return mustache.render(template, merged)
}

function get_connection(connp, ok_cb, err_cb) { //should convert this to promise?
    var pool=mysql.createPool(connp);
    pool.getConnection((err,connection)=>{
        if (err)
            err_cb(err)
        else 
            ok_cb(connection)
    })
}

function print_title(s) {
    return '<td class=heading>'+s+'</td>\n';
}
function param_one_of(value,values){
	if (_.includes(values,value)) //in python value in values
		return value
	return values[0];
}
function param_toggle(val,vals){ 
    return val==vals[0]?vals[1]:vals[0];
}
function cur_action(req){
    return req.path.replace(/^\/+/g, '').split('/')[0]
}
function href(req,overides={},copy_fields=[]){
    var path=overides.action||cur_action(req)
    overides.action=null
    var values=Object.assign({},_.pick(req.query,copy_fields),overides)
    values=_.pickBy(values,_.identity)//removed empty fields
    var ans= '/'+path+'/?'+Object.keys(values).map(key=>key+'='+values[key]).join('&')
    
    return ans.replace('//','/')
}
function a(req,text,overides={},copy_fields=[]){
    return `<a href='${href(req,overides,copy_fields)}'>${text}</a>`
}

function print_sort_title(req,field) {
    var dir=req.query.dir
    var sort=req.query.sort
    if (sort == field) {
        let dir_values = ['asc', 'desc'];
        let new_dir = param_one_of(dir, dir_values);
        let other_dir = param_toggle(new_dir,dir_values);
        let href_value = href(req,{dir:other_dir},nav_copy_fields);
        let img = '<img src=/'+dir+'.png>';
        return('<td class=heading id='+field+'><a href='+href_value+'>'+field+'  '+img+'</a></td>\n');
    } else {
        let link = a(req,field, {sort:field,dir:'asc'}, nav_copy_fields);
        return('<td class=heading id='+field+'>'+link+'</td>\n');
    }
}
function print_last_line(num_fields,no_rows_at_all) {
    var ans=print_title("*");
    ans+='<td colspan='+num_fields+'><b>';
    if(no_rows_at_all)
        ans+="(There are no rows in this table)"    ;
    else
        ans+="(There are no more rows)";
    ans+="</b></td>\n";
    return ans;
}
function decorate(val){
    if (val === null)
        return "<span class=ns>null</span>";
    if (val === true || val === false)
        return '<span class=ns>'+val+'</span>';
    return val
}
function print_val_td(val) {
    return('<td>'+decorate(val)+'</td>');
}
function print_next_prev(req,print_next) {
    function print_link(title,should_print,start){
        if (should_print) 
            return a(req,title, {start},nav_copy_fields);
        else
            return title;
    }
    return print_link('Last',req.start >= max_rows,req.start-max_rows)+
            "&nbsp;&nbsp;&nbsp; |&nbsp;&nbsp;&nbsp"+
          print_link('Next',print_next,req.start+max_rows)
}
function print_table_title(req,fields){
    var buf='<tr>'+print_title("   ");
    _.each(fields,(field)=>
        buf+=print_sort_title(req,field.name));
    buf+="</tr>";
    return buf
}
function print_row(req,row,oridnal,fields,first_col){
    var buf="<tr>\n";
    buf += print_title(oridnal);//row num
    _.each(fields, (field,j)=> {
        let val=row[field.name]
        if (j == 0 && first_col)
            val = first_col(req,val);
        buf+=print_val_td(val);
    })
    buf+="</tr>";
    return buf
}
function make_result(req,body,fields,print_next,lastline=''){
    var table="\n<table id=data>"+print_table_title(req,fields)+body+lastline+'</table>\n'
    return {
        nextprev:print_next_prev(req,print_next),
        query_result:table
    }
} 
function mem_print_table(req,view,results, fields) {
    var q=req.query
    if (q.sort)
        results=_.sortBy(results,(x)=>x[req.sort]);
    if (q.dir=='desc')
        results=results.reverse()
    var buf=''
    var shown_fields=_.filter(fields,(value, i)=>!view.show_cols||_.includes(view.show_cols,i))
    for (var i = req.start; i < req.start + max_rows; i++) {
        if (i >= results.length)
            return make_result(req,buf,shown_fields,false,print_last_line(fields.length,i==0))
        buf+=print_row(req,results[i],i+1,shown_fields,view.first_col)
    }
    return make_result(req,buf,shown_fields,true)
}
function result_print_table(req,view,results, fields) {
    var shown_fields=fields
    var buf=''
    for (var i = 0; i < max_rows; i++) {
        if (i >= results.length)
            return make_result(req,buf,fields,false,print_last_line(fields.length,i==0))
        buf+=print_row(req,results[i],i+1+req.start,shown_fields,view.first_col)
    }
    return make_result(req,buf,fields,true)
}
function decorate_database_name(req,val) {
    return a(req,val, {action:'database',database:val});
}
function decorate_table_name(req,val) {
    return a(req,val,{action:'table',table:val},['database']);
}
function read_connp(req) {
    var ans = req.session.connp
    ans = _.extend(ans, req.query)
    ans = _.pick(ans, 'host', 'user', 'password', 'database');
    return ans
}

function save_connp(req) {
    var connp = _.pick(req, 'host', 'user', 'password');
    req.cookies.set('connp', JSON.stringify(connp));
}
function query_and_send(req,res,view){
    var q=req.query;
    function calc_view2(results,fields,error){
        if (error)
            return { query_error: error }
        if (fields === undefined)
            return { ok: 'query completed succesfuly' }; //an exec query
        return view.printer(req,view,results, fields);
    } 
    function execute_and_send(connection){
        view.query_edit_href=href(req,{action:'query',query:view.query,database:q.database})
        var query=view.query+(view.query_decoration||'');
        connection.query(query,(error,results,fields)=>{
            var view2 = calc_view2(results, fields, error);
            view.logout_href = href(req,{ action: 'logout' })
            view.conn_p = read_connp(req);
            res.send(render(template, view,view2))
            connection.release()
        })
    }
    function redirect_to_login() {
        res.redirect('/login');
    }

    get_connection(read_connp(req), execute_and_send, redirect_to_login);
}

const databases_link=(req)=>a(req,'databases',{action:'databases'})

function print_switch(req,table_class, schema_class) {
    var data_ref = href(req,{action:'table'},['database','table']);
    var schema_href = href(req,{action:'table_schema'}, ['database', 'table']);
    return '(  <a '+table_class+' href='+data_ref+'>Data</a> | <a '+schema_class+' href='+schema_href+'>Schema</a> )';
}
function  calc_query_decoration(req){
    var q=req.query
    var ans='';
    if (q.sort)
        ans+=' order by '+q.sort+' '+q.dir+' ';
    ans+=' limit '+req.start+', '+max_rows;
    return ans
}

app.get('/login', (req, res)=>
    res.send(render(login_template))
)
app.get('/login_submit', (req, res)=>{
    get_connection(read_connp(req), 
        ()=>{
            req.session.connp=_.pick(req.query,conn_fields); //save field to the session
            res.redirect('/')
        },
        error=>res.send(render(login_template,req,{ error: error }))
    )

})

app.get('/logout',(req,res)=>{
    req.session.connp=null;
    res.redirect('/')
})
function databases(req,res){
    var view={
        about:'The table below shows all the databases that are accessible in this server: Click on any database below to browse it',
        title:'show databases',
        query:'show databases',
        printer:mem_print_table,
        first_col:decorate_database_name,
    }
    query_and_send(req,res,view)    
}
app.get('/databases',databases)
app.get('/',databases)

app.get('/database',(req,res)=>{
    var database = req.query.database;
    var view={
        about: 'The table below shows all the available tables in the database '+database+', Click on any table below to browse it',
        title: 'show database '+database,
        query: 'show table status',
        navbar: databases_link(req)+" / "+database,
        printer:mem_print_table,
        first_col:decorate_table_name,
        show_cols:[0, 1, 4, 17]
    }
    query_and_send(req,res,view)
})
app.get('/table',(req,res)=>{
    var database = req.query.database;
    var table = req.query.table;    
    var view={
        about:'The table below shows the table '+table+', you can select either schema or data view',
        view_options:print_switch(req,'class=selected', ''),
        title: database+' / ' +table,
        query: 'select * from '+table,
        navbar:databases_link(req)+' / '+decorate_database_name(req,database)+' / '+table,
        query_decoration: calc_query_decoration(req),
        printer:result_print_table
    }
    query_and_send(req,res,view)
})
app.get('/table_schema',(req,res)=>{
    var database = req.query.database;
    var table = req.query.table;    
    var view={
        about: 'The table below shows the table '+req.table+', you can select either schema or data view',
        view_options: print_switch(req,'', 'class=selected'),
        query:'describe '+table,
        navbar:databases_link(req)+" / "+decorate_database_name(req,database)+' / '+table,
        printer:mem_print_table
    }
    query_and_send(req,res,view)
})

app.get('/query',(req,res)=>{
    var q=req.query;
    var view={
        about:'Enter any sql query'+(q.database?' for database '+q.database:''),
        title:'User query',
        query:q.query,
        database:q.database,
        querytext:q.query,
        navbar:databases_link(req)+(q.database?' / ' + decorate_database_name(req,q.database):'')+' / query',
    }
    if (q.query.startsWith('select')){
        view.query_decoration=calc_query_decoration(req)
        view.printer=result_print_table
    }else
        view.printer=mem_print_table

    query_and_send(req,res,view,null,null)
})
const port = process.env.PORT||80
const host =process.env.HOST||'0.0.0.0'
app.listen(port,host, () => console.log(`SQL Rabbit listening on ${host}:${port}!`))