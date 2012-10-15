
//
// This is from jacksdamblog -- http://blog.jackadam.net/2010/alpha-jpegs/
// I changed the 'xor' to a 'source-in' so the same mask PNG could also be
// used with CSS image masks, changed how the canvas gets its dimension to
// account for images that might be scaled into place, and threw a bushel of 
// semicolons at it because I like them.
//
function create_alpha_jpeg(idx,img) {
	var alpha_path = img.getAttribute('data-mask');
	if(!alpha_path) return;

	// Hide the original un-alpha'd
	img.style.visiblity = 'hidden';

	var canvas = document.createElement('canvas');

	// For IE7/8
	if (!canvas.getContext) {
		img.onload = function(){
			img.style.visiblity = 'visible';
		}

		img.setAttribute('src', img.getAttribute('data-original'));
		img.removeAttribute('data-original');
		img.removeAttribute('data-mask');
		
		return;
	}


	// Preload the un-alpha'd image
	var image = document.createElement('img');
	image.src = img.src;
	image.onload = function () {


		// Then preload alpha mask
		var alpha = document.createElement('img');
		alpha.src = alpha_path;
		alpha.onload = function () {
			canvas.width = img.width;  // careful, use original's size in case there was scaling
			canvas.height = img.height;
			img.parentNode.replaceChild(canvas, img);
			
			// Canvas compositing code
			var context = canvas.getContext('2d');
			context.clearRect(0, 0, canvas.width, canvas.height);
			context.drawImage(alpha, 0, 0, canvas.width, canvas.height);
			context.globalCompositeOperation = 'source-in';
			context.drawImage(image, 0, 0, canvas.width, canvas.height);
		}
	}
}

//
// This is a base64 encoder from Ntt.cc    http://ntt.cc/2008/01/19/base64-encoder-decoder-with-javascript.html
//
var keyStr = "ABCDEFGHIJKLMNOP" +
				"QRSTUVWXYZabcdef" +
				"ghijklmnopqrstuv" +
				"wxyz0123456789+/" +
				"=";
 
function encode64(input) {
	//input = escape(input);
	var output = "";
	var chr1, chr2, chr3 = "";
	var enc1, enc2, enc3, enc4 = "";
	var i = 0;
 
	do {
		chr1 = input.charCodeAt(i++);
		chr2 = input.charCodeAt(i++);
		chr3 = input.charCodeAt(i++);
 
		enc1 = chr1 >> 2;
		enc2 = ((chr1 & 3) << 4) | (chr2 >> 4);
		enc3 = ((chr2 & 15) << 2) | (chr3 >> 6);
		enc4 = chr3 & 63;
 
		if (isNaN(chr2)) {
			enc3 = enc4 = 64;
		} else if (isNaN(chr3)) {
			enc4 = 64;
		}
 
		output = output +
		keyStr.charAt(enc1) +
		keyStr.charAt(enc2) +
		keyStr.charAt(enc3) +
		keyStr.charAt(enc4);
		chr1 = chr2 = chr3 = "";
		enc1 = enc2 = enc3 = enc4 = "";
	
	} while (i < input.length);
 
	return output;
}

function maskJPEG(val, useImageMask) {
	function extractMask( data) {
	//
	// A tiny class for dealing with binary streams of data
	//
	function ByteString( string) {
		var p = 0;

		function nth(n) {
			if ( typeof data == "string") {
				return string.charCodeAt(n) & 0xff;
			} else {
				return IEBinary_getByteAt(string,n);  // I have no IE but this looks promising.
			}
		}
		
		function next() {
			return nth(p++);
		}

		function skip(n) {
			p += n;
		}

		function nextBytes(n) { 
			if ( n == undefined)
				n = string.length - p;

			// ugly alert: substring is losing our encoding and using utf-8 which causes all the 
			//             codes over 127 to fail.
			//  var r = new ByteString( string.substring( p, p+n)); p+=n; return r; 
			var r = '';
			for ( var i = p; i < p+n; i++)
				r = r + String.fromCharCode( nth(i));
			
			p += n;
			return new ByteString(r);
		}
		
		function backup() {
			if ( --p < 0)
				p = 0;
		}

		function toString() {
			return string.substring(0);
		}

		return { 'next': next,
			skip: skip,
			backup: backup,
			nextBytes: nextBytes,
			toString: toString
		};
	};

	//
	// A tiny class for yanking the marker sections out of a JPEG.
	// It just skips the entropy encoded data. 
	// NOTE: Not well behaved if you try to read past the end or the image is corrupt.
	//
	function JPEG( bytes) {
		function eatEntropyData() {
		bytes.backup();
		bytes.backup();

		for (;;) {
			var a = bytes.next();
			if ( a != 0xff)
				continue;
			
			var b = bytes.next();
			if ( b == 0)
				continue; // an escaped 0xff
			
			// not an escaped 0xff, put the tag back and get out
			bytes.backup();
			bytes.backup();
			break;
		}
		};

		function nextMarker() {
			for (;;) {
				var ff = bytes.next();
				var tag = bytes.next();
				
				if ( ff != 0xff || tag == 0xff) eatEntropyData();
				else break;
			}

			// Tags without values
			if ( tag >= 0xd0 && tag <= 0xd9 || tag == 0)
				return { tag: tag, length: 0, value:undefined };
		
			// Tags with values
			var len = bytes.next()*256;
			len += bytes.next();

			return { tag: tag, length: len-2, value:bytes.nextBytes(len-2) };
		};
		
		return { nextMarker: nextMarker };
	};

	jpeg = new JPEG( new ByteString(data));

	var contentType;
	var contentData;

	for (;;) {
		var m = jpeg.nextMarker(); 

		//
		// Look for APP7 segments that begin 'alpha0'.
		// I expect one with 'content-type:' after it and another with 'data:' after it.
		//
		if ( m.tag == 0xe7 ) {
		var magic = m.value.nextBytes(6).toString();

		if ( magic == 'alpha0') {
			var kind = '';
			for (;;) {
				var c = m.value.next();
				if ( c == undefined || c == ':'.charCodeAt(0)) break;
					kind = kind + String.fromCharCode(c);
				}
				if ( kind == 'content-type') {
					contentType = m.value.nextBytes().toString();
				} else if ( kind == 'data') {
					contentData = m.value.nextBytes().toString();
				}
			}
		}
		if ( m.tag == 0xd9) break;   // end of image tag
	}

	if ( contentType && contentData) {
		var url =  "data:"+contentType+";base64,"+encode64( contentData);
		if ( useImageMask) {
			$(val).css('-webkit-mask-box-image',"url("+url+") 0 0 0 0 stretch stretch");
		} else {
			val.setAttribute('data-mask',url);
			create_alpha_jpeg(0,val);
		}
	}
	};

	$.ajax({
		url:val.src,
		success: extractMask,
		// vvvvvvvv   This is really important! Otherwise you try to parse unicode and "bad results" happen
		beforeSend: function(xhr) { xhr.overrideMimeType('text/plain; charset=x-user-defined'); },
		// ^^^^^^^^
		cache: true     // I mean for it to use the cache, but it isn't happening.
	});
};