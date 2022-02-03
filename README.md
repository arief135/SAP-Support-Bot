## Setup Database

1. Download `.zip` version of MongoDB Community Edition
2. Extract the zip file
3. Open command line to the extracted directory
4. Create data folder

        $ mkdir data\db

5. Run server without authentication

        $ bin\mongod.exe --dbpath data\db

6. Create user and database

        $ bin\mongo.exe
        > use admin
        > db.createUser({
                        user: "botUser",
                        pwd: "somePassword",
                        roles: [
                                { role: "dbAdmin", db: "sap-bot" },
                                { role: "readWrite", db: "sap-bot" }
                        ],
                })

7. Stop Server

        $ CTRL + C

8. Run server with authentication

        $ bin\mongod.exe --auth --dbpath data\db

9. Congratulations!