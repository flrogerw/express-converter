//dev-node-express@photoandgo.org
"use strict";
const aws = require('aws-sdk');
const spawn = require('child_process').spawn;
const Buffers = require('buffers');
const stream = require('stream');
const sizeOf = require('image-size');
var EventEmitter = require('events').EventEmitter;
var util = require('util');
const s3 = new aws.S3({apiVersion : '2006-03-01',region : 'us-east-1'});


var Converter = function() {

  this.convert = (processData) => {

    var self = this;
    s3.getObject({
      Bucket : processData.s3_bucket,
      Key : processData.s3_key
    }, (err, data) => {
      if(err){
        self.emit('error', err.message);// RETURN ERROR JSON HERE ?????
        return;
      }
      processData.image.buffer = new Buffer(data.Body);
      self.processImages(processData.image, processData.products);
    });
}

/**



*/
this.processImages = (image, products) => {

let self = this;
let hbsContext = [];

this.imageLoop = () => {

	let product = products.shift();
	let file = require('fs').createWriteStream('./tmp/'+product[image.orientation+'_overlay_image']);
  
	s3.getObject({
			Key: product.path+product[image.orientation+'_overlay_image'],
			Bucket: product.bucket
			}).on('httpDone', () => {

				let convertArgs = self.setConvertArgs(product, image);
				let uploadOptions = {
					Key: image.location + '/' + Math.floor(Math.random()*1001) + Date.now() + '.jpg',
					Bucket: image.bucket
				};

				self.createImage( image.buffer, convertArgs, uploadOptions).then(data => {

					hbsContext.push({url:data.Location, text:product.name});
					if(products.length == 0)
						self.emit('done', hbsContext);
            return;
					this.imageLoop();
				}).catch(err => {
						self.emit('error', err);
            return;
			});
	}).createReadStream().pipe(file);
}
this.imageLoop();
}

/*




*/
this.setConvertArgs = ( product, image ) => {

	let convertArgs = [];
	let dimensions = sizeOf('./tmp/'+product[image.orientation+'_overlay_image']);
	let imageSize = dimensions.width+'x'+dimensions.height;
	let x = image.width / 2;
	let y = image.height / 2;
	while(x > 0 && y > 0) {
		x -=1;
		y -= product[image.orientation+'_ratio'];
	}

	let cropInfo = (image.width-(2*Math.max(0,Math.floor(x)))) + 'x' + (image.height-(2*Math.max(0,Math.floor(y)))) + '+' + Math.max(0,Math.floor(x)) + '+' + Math.max(0,Math.floor(y));

	convertArgs.push( '-size', imageSize, 'xc:none');
	convertArgs.push( '(','-', '-crop', cropInfo, '-resize', product[image.orientation+'_resize'],')' );
	convertArgs.push( '-geometry', product[image.orientation+'_geometry']);
	convertArgs.push( '-composite');
	convertArgs.push( './tmp/'+product[image.orientation+'_overlay_image'] );
	convertArgs.push( '-composite');
	convertArgs.push('jpg:-');
	return(convertArgs);
}

/*



*/
this.createImage = (imageBuffer, convertArgs, options) => {

	return new Promise((resolve, reject) => {

		let bufferStream = new stream.PassThrough();
		bufferStream.end(imageBuffer);
		let buffer = new Buffers();
		let convert = spawn("convert", convertArgs);

		bufferStream.pipe(convert.stdin);
		convert.stdout.on('error', (err) => {reject(err.message)});
		convert.stdout.on('data', buffer.push.bind(buffer));
		convert.stdout.on('end', () => {
			options.Body = buffer;
			s3.upload(options, (err, data) => {
				if (err)	reject(err)
				resolve(data)
			});
		});
	});
}

}
util.inherits(Converter, EventEmitter);

module.exports = Converter;
