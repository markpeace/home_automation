clear

cp config.xml www
cp -r resources www

git add .
git commit -a -m "$*"
git clean -f
git push origin master

curl -u mark@learnsomestuff.com -X PUT -d 'data={"pull":"true"}' https://build.phonegap.com/api/v1/apps/1618877

#cd cloudcode
#cp config/dev.json config/global.json
#parse deploy
#rm config/global.json
#cp config/prod.json config/global.json
#parse deploy
#rm config/global.json
#cd ..

ionic upload