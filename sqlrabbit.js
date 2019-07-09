'use strict'
const Router = require('myrouter');
const mustache=require('mustache');
const _=require('lodash');
const fs = require('fs');
var mysql      = require('mysql');
const Cookies = require('cookies')
const nav_copy_fields=['sort', 'database', 'query', 'table', 'action', 'dir']
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

function get_connection(connp, ok, err) {
    var connection = mysql.createConnection(connp);
    connection.connect(err_msg=>{
        if (err_msg)
            err(err_msg)
        else
            ok(connection); 
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
function print_sort_title(p,field) {
    if (p.sort == field) {
        let dir_values = ['asc', 'desc'];
        let dir = param_one_of(p.dir, dir_values);
        let other_dir = param_toggle(p.dir,dir_values);
        let href = p.href({dir:other_dir},nav_copy_fields);
        let img = '<img src=/media/'+dir+'.png>';
        return('<td class=heading id='+field+'><a href='+href+'>'+field+'  '+img+'</a></td>\n');
    } else {
        let link = p.a(field, {sort:field,dir:'asc'}, nav_copy_fields);
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
function print_next_prev(p,print_next) {
    function print_link(title,should_print,start){
        if (should_print) 
            return p.a(title, {start:start},nav_copy_fields);
        else
            return title;
    }
    return print_link('Last',p.start >= max_rows,p.start-max_rows)+
            "&nbsp;&nbsp;&nbsp; |&nbsp;&nbsp;&nbsp"+
          print_link('Next',print_next,p.start+max_rows)
}
function print_table_title(p,fields){
    var buf='<tr>'+print_title("   ");
    _.each(fields,(field)=>
        buf+=print_sort_title(p,field.name));
    buf+="</tr>";
    return buf
}
function print_row(p,row,oridnal,fields,first_col){
    var buf="<tr>\n";
    buf += print_title(oridnal);//row num
    _.each(fields, (field,j)=> {
        let val=row[field.name]
        if (j == 0 && first_col)
            val = first_col(p,val);
        buf+=print_val_td(val);
    })
    buf+="</tr>";
    return buf
}
function make_result(p,body,fields,print_next,lastline=''){
    var table="\n<table id=data>"+print_table_title(p,fields)+body+lastline+'</table>\n'
    return {
        nextprev:print_next_prev(p,print_next),
        query_result:table
    }
} 
function mem_print_table(p,view,results, fields) {
    if (p.sort)
        results=_.sortBy(results,(x)=>x[p.sort]);
    if (p.dir=='desc')
        results=results.reverse()
    var buf=''
    var shown_fields=_.filter(fields,(value, i)=>!view.show_cols||_.includes(view.show_cols,i))
    for (var i = p.start; i < p.start + max_rows; i++) {
        if (i >= results.length)
            return make_result(p,buf,shown_fields,false,print_last_line(fields.length,i==0))
        buf+=print_row(p,results[i],i+1,shown_fields,view.first_col)
    }
    return make_result(p,buf,shown_fields,true)
}
function result_print_table(p,view,results, fields) {
    var shown_fields=fields
    var buf=''
    for (var i = 0; i < max_rows; i++) {
        if (i >= results.length)
            return make_result(p,buf,fields,false,print_last_line(fields.length,i==0))
        buf+=print_row(p,results[i],i+1+p.start,shown_fields,view.first_col)
    }
    return make_result(p,buf,fields,true)
}
function decorate_database_name(p,val) {
    return p.a(val, {action:'database',database:val});
}
function decorate_table_name(p,val) {
    return p.a(val,{action:'table',table:val},['database']);
}
function read_connp(p) {
    function read_from_cookie() {
        try {
            return JSON.parse(p.cookies.get('connp'));
            
        } catch (e) {
            return { host: 'localhost', user: 'guest', password: 'guest' }
        }
    }
    var ans = read_from_cookie()
    ans = _.extend(ans, p)
     ans = _.pick(ans, 'host', 'user', 'password', 'database');
    return ans
}

function save_connp(p) {
    var connp = _.pick(p, 'host', 'user', 'password');
    p.cookies.set('connp', JSON.stringify(connp));
}
function query_and_send(p,view){
    function calc_view2(results,fields,error){
        if (error)
            return { query_error: error }
        if (fields === undefined)
            return { ok: 'query completed succesfuly' }; //an exec query
        return view.printer(p,view,results, fields);
    }
    function execute_and_send(connection){
        view.query_edit_href=p.href({action:'query',query:view.query,database:p.database})
        var query=view.query+(view.query_decoration||'');
        connection.query(query,(error,results,fields)=>{
            var view2 = calc_view2(results, fields, error);
            view.logout_href = p.href({ action: 'logout' })
            view.conn_p = read_connp(p);
            p.res.end(render(template, view,view2))
            connection.destroy()
        })
    }
    function redirect_to_login() {
        send_redirect(p,p.href({ action: 'login' }));
    }

    get_connection(read_connp(p), execute_and_send, redirect_to_login);
}
function databases_link(p) {
    return p.a('databases',{action:'databases'});
}
function print_switch(p,table_class, schema_class) {
    var data_ref = p.href({action:'table'},['database','table']);
    var schema_href = p.href({action:'table_schema'}, ['database', 'table']);
    return '(  <a '+table_class+' href='+data_ref+'>Data</a> | <a '+schema_class+' href='+schema_href+'>Schema</a> )';
}
function  calc_query_decoration(p){
   var ans='';
    if (p.sort)
        ans+=' order by '+p.sort+' '+p.dir+' ';
    ans+=' limit '+p.start+', '+max_rows;
    return ans
}
function send_redirect(p,url){
    p.res.writeHead(302, { 'Location': url })
    p.res.end();
};
function SqlRabbit(){
    this.all=(p)=>{
        p.start=parseInt(p.start)||0
        p.cookies=new Cookies(p.req,p.res);
    }
    this.login=(p)=>{
        p.res.end(render(login_template,p))      
    }
    this.login_submit = (p) => {
        function login_error(error){
            p.res.end(render(login_template, p, { error: error }))
        }
        function login_ok(connection) {
            send_redirect(p, '/');
        }
        save_connp(p)
        get_connection(p, login_ok, login_error);        
    }
    this.logout=(p)=>{
        p.cookies.set('connp');
        send_redirect(p, '/');
    }
    this.databases=(p)=>{
        var view={
            about:'The table below shows all the databases that are accessible in this server: Click on any database below to browse it',
            title:'show databases',
            query:'show databases',
            printer:mem_print_table,
            first_col:decorate_database_name,
        }
        query_and_send(p,view,null,decorate_database_name)
    }
    this.database=(p)=>{
        var database = p.database;
        var view={
            about: 'The table below shows all the available tables in the database '+database+', Click on any table below to browse it',
            title: 'show database '+database,
            query: 'show table status',
            navbar: databases_link(p)+" / "+database,
            printer:mem_print_table,
            first_col:decorate_table_name,
            show_cols:[0, 1, 4, 17]
        }
        query_and_send(p,view)
    }
    this.table=(p)=>{
        var view={
            about:'The table below shows the table '+p.table+', you can select either schema or data view',
            view_options:print_switch(p,'class=selected', ''),
            title: p.database+' / ' +p.table,
            query: 'select * from '+p.table,
            navbar:databases_link(p)+' / '+decorate_database_name(p,p.database)+' / '+p.table,
            query_decoration: calc_query_decoration(p),
            printer:result_print_table
        }
        query_and_send(p,view)
    }
    this.table_schema=(p)=>{
        var view={
            about: 'The table below shows the table '+p.table+', you can select either schema or data view',
            view_options: print_switch(p,'', 'class=selected'),
            query:'describe '+p.table,
            navbar:databases_link(p)+" / "+decorate_database_name(p,p.database)+' / '+p.table,
            printer:mem_print_table
        }
        query_and_send(p,view)
    }
    this.query=(p)=>{
        var view={
            about:'Enter any sql query'+(p.database?' for database '+p.database:''),
            title:'User query',
            query:p.query,
            database:p.database,
            querytext:p.query,
            navbar:databases_link(p)+(p.database?'/' + decorate_database_name(p,p.database):'')+' / query',
            printer:result_print_table
        }
        if (p.query.startsWith('select'))
            view.query_decoration=calc_query_decoration(p)
        query_and_send(p,view,null,null)
   }
}
Router({
    static_files:'^(/favicon.ico)|(/media/.*)$',
    controller:new SqlRabbit(),
    default_action:'databases',
    port:80,
    hostname:'0.0.0.0',
    path_rules:[
        'databases:start',
        'database/database:start',
        'table/database/table:start',
        'table_schema/database/table:start']
})