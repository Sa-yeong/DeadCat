# PostgreSQL 구축 코드
## ERD 1
### 1. (종목을 나누는) 카테고리 테이블 
``` sql
Create Table categories(
	id BIGINT generated always as identity,
	name varchar(100) not null,
	primary key(id)
);
```

### 2. 종목 테이블
``` sql
create table stocks(
	id BIGINT generated always as identity,
	code varchar(20) not null,
	exchange_code varchar(10),
	category_id BIGINT not null,
	stock_type varchar(10) NOT NULL check(stock_type in('DOMESTIC', 'FOREIGN')),
	name varchar(100) not null,
	market_cap BIGINT not null,
	ev BIGINT not null,
	per Decimal(10, 2) not null,
	psr Decimal(10, 2) not null,
	pbr Decimal(10, 2) not null,
	eps Decimal(15, 2) not null,
	bps Decimal(15, 2) not null,
	roe Decimal(10, 2) not null,
	
	primary key(id),
	foreign key(category_id) References categories(id) on delete Restrict,
	
	constraint chk_foreign_exchange_code Check(
		(stock_type = 'FOREIGN' And exchange_code is not null)
		or
		(stock_type = 'DOMESTIC')
	)
);
```

### 3. 사용자 테이블
```sql
create table users(
	id BIGINT generated always as identity,
	login_id varchar(100) not null Unique,
	login_pw varchar(255) not null,
	nickname varchar(15) not null Unique,
	balance BIGINT not null default 100000000 check(balance>=0),
	represent_stock_id BIGINT,
	
	primary key(id),
	foreign key(represent_stock_id) references stocks(id) on Delete set null
);
```

### 4. 캐릭터 테이블 
```sql
create table characters(
	stock_id BIGINT,
	img_url varchar(200) not null,
	primary key(stock_id),
	foreign key(stock_id) references stocks(id) on Delete Cascade
);
```
추후 속성을 더 추가할 예정 (ex. 성격 등..)

### 5. 거래 내역 테이블
```sql
create table transaction_history(
	id BIGINT generated always as identity,
	user_id BIGINT not null,
	stock_id BIGINT not null,
	trade_type varchar(10) not null check(trade_type in ('BUY', 'SELL')),
	quantity Integer not null check(quantity>0),
	trade_price BIGINT not null check(trade_price>0),
	transaction_time TIMESTAMP default CURRENT_TIMESTAMP,
	primary key(id),
	foreign key(user_id) references users(id) on Delete cascade,
	foreign key(stock_id) references stocks(id)
);
```

### 6. 보유주식 테이블
```sql
create table holdings(
	user_id BIGINT,
	stock_id BIGINT,
	quantity Integer not null check(quantity >0),
	mean_price_krw BIGINT not null check(mean_price_krw>0),
	mean_price_foreign Decimal(15, 2) check(mean_price_foreign>0),
	primary key(user_id, stock_id),
	foreign key(user_id) references users(id) on Delete Cascade,
	foreign key(stock_id) references stocks(id) on Delete Restrict
);
```

### 7. 관심 종목 테이블
```sql
create table interest(
	user_id BIGINT,
	stock_id BIGINT,
	select_time timestamp not null default CURRENT_TIMESTAMP,
	primary key(user_id, stock_id),
	foreign key(user_id) references users(id) on Delete Cascade,
	foreign key(stock_id) references stocks(id) on Delete Cascade
);
```

### 8. 호감도 테이블
```sql
create table affinity(
	user_id BIGINT,
	stock_id BIGINT,
	affinity_score smallINT not null Default 0,
	
	primary key(user_id, stock_id),
	foreign key(user_id) references users(id) on Delete Cascade,
	foreign key(stock_id) references stocks(id) on Delete Restrict
);
```

### 9. 종목의 요약 정보 내역 테이블 -> 차트 렌더링을 위함
```sql
create table stock_history(
	stock_id BIGINT,
	record_date date Default CURRENT_DATE,
	open_price BIGINT not null check(open_price>=0),
	close_price BIGINT not null check(close_price>=0),
	low_price BIGINT not null check(low_price>=0),
	high_price BIGINT not null check(high_price>=0),
	
	primary key(stock_id, record_date),
	foreign key(stock_id) references stocks(id) on Delete Cascade
);
```

## ERD 2
### 1. 가구 테이블
```sql
create table furnitures(
	id BIGINT generated always as identity,
	name varchar(100) not null unique,
	primary key(id)
);
```

### 2. 옷 테이블 
```sql
create table clothes(
	id BIGINT generated always as identity,
	name varchar(100) not null unique,
	primary key(id)
);
```

### 3. 아이템 테이블
```sql
create table items(
	id BIGINT generated always as identity,
	name varchar(100) not null unique,
	effect_value smallInt not null, #캐릭터에게 부여시 호감도가 올라가는 정도
	primary key(id)
);
```

### 4. 사용자가 보유한 가구 테이블
```sql
create table storage(
	user_id BIGINT,
	furniture_id BIGINT,
	quantity smallInt Not null check(quantity > 0),
	primary key(user_id, furniture_id),
	foreign key(user_id) references users(id) on Delete Cascade,
	foreign key(furniture_id) references furnitures(id) on Delete Restrict
);
```

### 5. 사용자가 홈화면에 비치한 가구 테이블
```sql
create table placed(
	id BIGINT generated always as identity,
	user_id BIGINT not null,
	furniture_id BIGINT not null,
	position_x Decimal(10,5) not null,
	position_y Decimal(10, 5) not null,
	primary key(id),
	Unique(user_id, furniture_id),
	Foreign key(user_id) references users(id) on Delete Cascade,
	Foreign key(furniture_id) references furnitures(id) on Delete Restrict
);
```

### 6. 사용자가 보유한 아이템 테이블
```sql
create table inventory(
	user_id BIGINT,
	item_id BIGINT,
	quantity Integer not null check(quantity>0),
	primary key(user_id, item_id),
	foreign key(user_id) references users(id) on Delete Cascade,
	foreign key(item_id) references items(id) on Delete Restrict
);
```

### 7. 사용자가 보유한 옷 테이블
```sql
create table wardrobe(
	user_id BIGINT,
	clothes_id BIGINT,
	primary key(user_id, clothes_id),
	Foreign key(user_id) references users(id) on Delete Cascade,
	Foreign key(clothes_id) references clothes(id) on Delete Restrict
);
```

### 8. 해금되는 가구 테이블
```sql
create table unlock_furniture(
	stock_id BIGINT,
	furniture_id BIGINT,
	affinity_constraint smallINT not null check(affinity_constraint > 0),
	primary key(stock_id, furniture_id),
	foreign key(stock_id) references stocks(id) on Delete Restrict,
	foreign key(furniture_id) references furnitures(id) on Delete Cascade
);
```

### 9. 해금되는 옷 테이블
```sql
create table unlock_clothes(
	stock_id BIGINT,
	clothes_id BIGINT,
	score_constraint Integer not null check(score_constraint > 0),
	primary key(stock_id, clothes_id),
	foreign key(stock_id) references stocks(id) on Delete Restrict,
	foreign key(clothes_id) references clothes(id) on Delete Cascade
);
```

## ERD 3
### 1. 게시물 테이블
```sql
create table posts(
	id BIGINT generated always as identity,
	user_id BIGINT,
	title varchar(50) not null,
	content varchar(500) not null,
	write_time timestamp not null default CURRENT_TIMESTAMP,
	primary key(id),
	foreign key(user_id) references users(id) on Delete set Null
);
```

### 2. 댓글 테이블
```sql
create table comments(
	id BIGINT generated always as identity,
	post_id BIGINT not null,
	user_id BIGINT not null,
	content varchar(150) not null,
	write_time timestamp not null default CURRENT_TIMESTAMP,
	primary key(id),
	Foreign key(post_id) references posts(id) on Delete Cascade,
	Foreign key(user_id) references users(id) on Delete set Null
);
```

### 3. 간단한 투표 정보 테이블
```sql
create table vote(
	id BIGINT generated always as identity,
	subject varchar(200) not null,
	state boolean not null,
	start_date date not null,
	end_date date not null,
	agree_result Decimal(5,4),
	primary key(id)
);
```

### 4. 사용자가 '좋아요' 누른 게시글 테이블
```sql
create table like_posts(
	user_id BIGINT,
	post_id BIGINT,
	primary key(user_id, post_id),
	foreign key(user_id) references users(id) on Delete Cascade,
	foreign key(post_id) references posts(id) on Delete Cascade
);
```

### 5. 사용자가 '좋아요' 누른 댓글 테이블
```sql
create table like_comments(
	user_id BIGINT,
	comment_id BIGINT,
	primary key(user_id ,comment_id),
	foreign key(user_id) references users(id) on Delete Cascade,
	foreign key(comment_id) references comments(id) on Delete Cascade
);
```

### 6. 사용자가 참여한 투표 테이블
```sql
create table voting(
	user_id BIGINT,
	vote_id BIGINT,
	agree boolean not null,
	primary key(user_id, vote_id),
	foreign key(user_id) references users(id) on Delete Cascade,
	foreign key(vote_id) references vote(id) on Delete Restrict
);
```

## ERD 4
### 1. 지수 테이블
```sql
create table indices(
	id BIGINT generated always as identity,
	name varchar(100) not null,
	primary key(id)
);
```

### 2. 지수 종목 요약 내역 테이블 -> 지수의 그래프 랜더링을 위함
```sql
create table indices_history(
	indices_id BIGINT,
	open_price Decimal(10,2) not null,
	close_price Decimal(10,2) not null,
	low_price Decimal(10,2) not null,
	high_price Decimal(10,2) not null,
	write_date Date not null Default CURRENT_DATE,
	primary key(indices_id, write_date),
	foreign key(indices_id) references indices(id) on Delete Cascade
);
```
