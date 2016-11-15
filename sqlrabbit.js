'use strict'
const Router = require('myrouter');
const mustache=require('mustache');
const _=require('lodash');
const fs = require('fs');
var mysql      = require('mysql');
const Cookies = require('cookies')



const nav_copy_fields=['sort', 'database', 'query', 'table', 'action', 'dir']
const max_rows=100
var count=0;

var template = read_template('templates/template.htm');
var login_template = read_template('templates/login_template.htm')
function read_template(file_name){
    var content=fs.readFileSync(file_name,'utf8')
    return content
    console.log(content)
    return mustache.parse(content)
}

function get_connection(p,ok,err){
    var connection = mysql.createConnection(p.conn_p);
    connection.connect(err_msg=>{
        if (err_msg)
            err(err_msg)
        else
            ok(connection); 
    })
}
function send(p,vals,vals2){
    _.extend(vals,vals2,p)
    p.res.end(mustache.render(template, vals))
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
function print_val_td(val) {
    function decorate(val){
        if (val === null)
            return "<span class=ns>null</span>";
        if (val === true || val === false)
            return '<span class=ns>'+val+'</span>';
        return val
    }
    return('<td>'+val+'</td>');
}
function print_next_prev(p,print_next) {
    var buf='';
    if (p.start >= max_rows) {
        buf+=p.a('Last', {start:p.start-max_rows},nav_copy_fields);
    }else
        buf+='Last';
    buf+= "&nbsp;&nbsp;&nbsp; |&nbsp;&nbsp;&nbsp";
    if (print_next) {
        buf+=p.a('Next',{start:p.start + max_rows}, nav_copy_fields);
    }else
        buf+='Next';
    return buf;
}

function print_table(p,results, fields,shown_columns, first_column_decorator) {
    if (results === true) {
        return {ok:'query completed succesfuly'}; //an exec query
        return ans;
    }
    var ans = {};
    if (p.mem_sorting){
        if (p.sort)
            results=_.sortBy(results,(x)=>x[p.sort]);
        if (p.dir=='desc')
            results=results.reverse()
    }  
    var buf='';
    buf+="\n<table id=data><tr>";
    buf+=print_title("   ");
    var shown_fields=_.filter(fields,(value, i)=>!shown_columns||i in shown_columns)

    _.each(shown_fields,(field)=>
        buf+=print_sort_title(p,field.name));
    
    buf+="</tr>";
    var print_next=true;
    for (let i = p.start; i < p.start + max_rows; i++) {
        var  row=null
        if (i < results.length)
            row = results[i];
        buf+="<tr>\n";
        if (!row) {
            buf+=print_last_line(fields.length, i == 0);
            print_next = false;
            break;
        }
        buf += print_title(i + 1);//row num
        _.each(shown_fields, (field,j)=> {
            let val=row[field.name]
            if (j == 0 && first_column_decorator)
                val = first_column_decorator(p,val);
            buf+=print_val_td(val);
        })
        buf+="</tr>";
    }
    buf+='</table>\n';
    ans.nextprev=print_next_prev(p,print_next);
    ans.query_result=buf;
    return ans;
}
function decorate_database_name(p,val) {
    return p.a(val, {action:'database',database:val});
}
function decorate_table_name(p,val) {
    return p.a(val,{action:'table',table:val},['database']);
}
function execute(query){
    function doit(connection){
        function the_func(resolve,reject){
            connection.query(query,(error,results,fields)=>{
                if (error)
                    reject(error)
                else
                    resolve([results,fields])
            })
        }
        return new Promise(the_func)
    }
    return doit;
}

function query_and_send(p,view,show_columns,first_col_decorator){
    function send_results(results,fields){
        if (!view.query_decoration)
            p.mem_sorting=true
        var table=print_table(p,results, fields,show_columns,first_col_decorator);
        send(p,table,view);
    }
    function send_error(msg){
       send(p,{query_error:msg},view);
    }
    function execute_and_send(connection){
        view.query_edit_href=p.href({action:'query',query:view.query,database:p.database})
        var query=view.query+(view.query_decoration||'');
        connection.query(query,(error,results,fields)=>{
            if (error)
                send_error(error)
            else
                send_results(results,fields)
        })
    }
    function show_login_dialog(error){
        var view={};
        if (p.show_login_error)
            view.error=error
        _.extend(view,p.conn_p)
        p.res.end(mustache.render(login_template, view))
    }
    get_connection(p,execute_and_send,show_login_dialog);
    //.then(execute(view.query+(view.query_decoration||''))).catch(show_login(p)).then(send_results,send_error)
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
function calc_conn_p(p){
    return {
        host     : p.cookies.get('host'),//||'localhoster',
        user     : p.cookies.get('user'),//||'guest',
        password : p.cookies.get('password'),//||'guest',
        database :  p.database
        /*host     : 'localhost',
        user     : 'root',
        password : 'ilana',*/      
    }
}
function SqlRabbit(){
    this.all=(p)=>{
        p.start=parseInt(p.start)||0
        p.cookies=new Cookies(p.req,p.res);
        p.conn_p=calc_conn_p(p);
        p.logout_href=p.href({action:'logout'})
    }
    this.login_submit=(p)=>{
        p.cookies.set('host',p.host);
        p.cookies.set('user',p.user);
        p.cookies.set('password',p.password);
        p.conn_p=calc_conn_p(p);
        p.show_login_error=true;
        this.databases(p);
    }
    this.logout=(p)=>{
        p.cookies.set('host');
        p.cookies.set('user');
        p.cookies.set('password');
        p.show_login_error=false;
        this.databases(p);
    }
    this.databases=(p)=>{
        var view={
            about:'The table below shows all the databases that are accessible in this server: Click on any database below to browse it',
            title:'show databases',
            query:'show databases',
        }
        
        query_and_send(p,view,null,decorate_database_name)
    }
    this.database=(p)=>{
        var database = p.database;
        var view={
            about: 'The table below shows all the available tables in the database '+database+', Click on any table below to browse it',
            title: 'show database '+database,
            query: 'show table status',
            navbar: databases_link(p)+" / "+database
        }
        query_and_send(p,view,[0, 1, 4, 17],decorate_table_name)
    }
    this.table=(p)=>{
        var view={
            about:'The table below shows the table '+p.table+', you can select either schema or data view',
            view_options:print_switch(p,'class=selected', ''),
            title: p.database+' / ' +p.table,
            query: 'select * from '+p.table,
            navbar:databases_link(p)+' / '+decorate_database_name(p,p.database)+' / '+p.table,
            query_decoration: calc_query_decoration(p)
        }
        query_and_send(p,view,null,null)
    }
    this.table_schema=(p)=>{
        var view={
            about: 'The table below shows the table '+p.table+', you can select either schema or data view',
            view_options: print_switch(p,'', 'class=selected'),
            query:'describe '+p.table,
            navbar:databases_link(p)+" / "+decorate_database_name(p,p.database)+' / '+p.table
        }
        query_and_send(p,view,null,null)
    }
    this.query=(p)=>{
        var view={
            about:'Enter any sql query'+(p.database?' for database '+p.database:''),
            title:'User query',
            query:p.query,
            querytext:p.query,
            navbar:databases_link(p)+(p.database?'/' + decorate_database_name(p,p.database):'')+' / query'
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
    port:3000,
    path_rules:[
        'databases:start',
        'database/database:start',
        'table/database/table:start',
        'table_schema/database/table:start']
})