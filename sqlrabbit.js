'use strict'
const Router = require('myrouter');
const mustache=require('mustache');
const _=require('lodash');
const fs = require('fs');
var mysql      = require('mysql');
const Cookies = require('cookies')



const nav_copy_fields=['sort', 'database', 'query', 'table', 'action', 'dir']
const max_rows=1000
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

function query_and_send(p,view){
    function send_results(results,fields){
        if (results === true)
            var view2= {ok:'query completed succesfuly'}; //an exec query
        else
            var view2=view.printer(p,view,results, fields);
        send(p,view,view2);
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
            connection.destroy()
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
            printer:mem_print_table
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
    port:3000,
    path_rules:[
        'databases:start',
        'database/database:start',
        'table/database/table:start',
        'table_schema/database/table:start']
})