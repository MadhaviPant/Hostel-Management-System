CREATE DATABASE AdmissionDB;
USE AdmissionDB;

CREATE TABLE Student (
    stud_id INT PRIMARY KEY,
    stud_name VARCHAR(30),
    city VARCHAR(20),
    mobile VARCHAR(15)
);

CREATE TABLE Course (
    course_id INT PRIMARY KEY,
    course_name VARCHAR(30),
    fees INT
);

CREATE TABLE Registration (
    reg_id INT PRIMARY KEY,
    stud_id INT,
    course_id INT,
    reg_date DATE,

    FOREIGN KEY (stud_id) REFERENCES Student(stud_id),
    FOREIGN KEY (course_id) REFERENCES Course(course_id)
);

INSERT INTO Student VALUES
(1,'Amit','Pune','9876543210'),
(2,'Neha','Mumbai','9876543211'),
(3,'Ravi','Nashik','9876543212');

INSERT INTO Course VALUES
(101,'BCA',50000),
(102,'BBA',45000),
(103,'MCA',70000);

INSERT INTO Registration VALUES
(1,1,101,'2025-01-01'),
(2,2,102,'2025-01-02'),
(3,3,103,'2025-01-03');

CREATE USER 'user1'@'localhost'
IDENTIFIED BY 'pass123';

GRANT SELECT, INSERT
ON AdmissionDB.Student
TO 'user1'@'localhost';

REVOKE SELECT, INSERT
ON AdmissionDB.Student
FROM 'user1'@'localhost';


-- 2.	Consider the relational database given below:
--                employee (emp_name,street,city)
  --              works(emp_name, company_name,salary)
    --            company(company_name, city)
      --          manager(emp_name, manager_name)



create table employee
(
	emp_name varchar(10) primary key,
    street varchar(30),
    city varchar(20)
);

create table company
(
	company_name varchar(10) primary key,
    city varchar(10)
);

create table works 
(
	emp_name varchar(10),
    company_name varchar(10),
    salary decimal(10,2),
    
    foreign key (emp_name) references employee(emp_name),
    foreign key (company_name) references company(company_name)
);

create table manager
(
	emp_name varchar(10), 
    manager_name varchar(10),
    
    foreign key (emp_name) references employee(emp_name),
    foreign key (manager_name) references employee(emp_name)
);

-- Employee Table Data
INSERT INTO employee VALUES
('Amit','MG Road','Pune'),
('Neha','FC Road','Mumbai'),
('Ravi','JM Road','Pune'),
('Sneha','Park Street','Delhi'),
('Karan','Ring Road','Pune'),
('Priya','Hill Road','Mumbai'),
('Raj','Lake Road','Pune'),
('Simran','Palm Street','Nagpur'),
('Ankit','College Corner','Pune'),
('Pooja','Station Road','Delhi');

-- Company Table Data
INSERT INTO company VALUES
('ABC Ltd','Pune'),
('Central','Mumbai'),
('Infosys','Pune'),
('TCS','Delhi'),
('Wipro','Nagpur');

-- Works Table Data
INSERT INTO works VALUES
('Amit','ABC Ltd',15000),
('Neha','Central',12000),
('Ravi','Infosys',25000),
('Sneha','TCS',18000),
('Karan','ABC Ltd',17000),
('Priya','Central',9000),
('Raj','Infosys',30000),
('Simran','Wipro',22000),
('Ankit','ABC Ltd',14000),
('Pooja','TCS',16000);

-- Manager Table Data
INSERT INTO manager VALUES
('Amit','Ravi'),
('Neha','Priya'),
('Ravi','Raj'),
('Sneha','Ravi'),
('Karan','Raj'),
('Priya','Neha'),
('Raj','Ravi'),
('Simran','Raj'),
('Ankit','Ravi'),
('Pooja','Raj');

-- 1.Find the emp_name , street and cities of residence of employees whose salary exists in between 10000 and 20000 
-- and work for ABC Ltd.
select e.emp_name,e.street,e.city
from works w 
join employee e
on e.emp_name = w.emp_name
join company c 
on c.company_name = w.company_name
Where w.salary>=10000 and w.salary<=20000
and c.company_name = 'ABC Ltd';

-- 2. Find the name, street and cities of employees who live in the same city as the company theywork for.
select e.emp_name,e.street,e.city
from works w 
join employee e
on e.emp_name = w.emp_name
join company c 
on c.company_name = w.company_name
where c.city = e.city;

-- 3. Find all employees in the database who earn more than each employee of Central Bank.
select emp_name 
from works
where salary>(
	select max(salary)
    from works
    where company_name = 'Central'
);

-- 4. Find the company that has the most employees.
select company_name ,count(*) as no_of_employee 
from works
group by company_name
order by no_of_employee desc
Limit 1;

-- 5. Find the company that has the smallest salary payout.
select company_name ,sum(salary) as payout
from works
group by company_name
order by payout asc
Limit 1;

-- 6. Find those companies whose employees earn a higher salary, on average, than the average salary at Central Bank.
select company_name , avg(salary) as avg_salary 
from works
group by company_name
having avg_salary > (
	select avg(w.salary)
    from works w
    where company_name = 'Central'
);

-- 7. Find all employees who live in the same city and on the same street as do the manager.
select e.emp_name
from employee e
join manager m
on e.emp_name = m.emp_name
join employee me
on me.emp_name = m.manager_name
WHERE e.city = me.city
AND e.street = me.street;

-- 8. Find the names of employee who do not work for ABC Ltd.
select emp_name,company_name
from works
where company_name <> 'ABC Ltd';


-- 9. Find all the employees with location of the city starting with ‘P’.
select emp_name,city
from employee
Where city like'P%';


-- 10. Find all the employees with street name ending with ‘R’.
select emp_name,street
from employee
Where street like'%R';

