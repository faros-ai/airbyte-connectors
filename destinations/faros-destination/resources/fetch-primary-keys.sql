select kcu.table_name,
    cols.generation_expression as exp
from information_schema.table_constraints tco
join information_schema.key_column_usage kcu 
    on kcu.constraint_name = tco.constraint_name
    and kcu.constraint_schema = tco.constraint_schema
    and kcu.constraint_name = tco.constraint_name
join information_schema.columns cols
    on kcu.table_name = cols.table_name
    and kcu.column_name = cols.column_name
where tco.constraint_type = 'PRIMARY KEY'
    and kcu.table_schema = 'public'
    and kcu.column_name = 'id'
    and cols.generation_expression is not null
order by kcu.table_schema,
         kcu.table_name;
